export type PreReviewSeverity = 'low' | 'medium' | 'high';

export type PreReviewAssistantMessage = {
  id: string;
  content: string;
};

export type NormalizedPreReviewIssue = {
  messageId: string;
  quote: string;
  label: string;
  severity: PreReviewSeverity;
};

export type NormalizedPreReviewResult = {
  messageId: string;
  status: 'checked' | 'missing_result';
  source: 'conversation' | 'single_message';
  issues: NormalizedPreReviewIssue[];
  rawIssueCount: number;
  ignoredIssueCount: number;
  error?: string;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function foldPreReviewText(text: string) {
  return [...text]
    .filter((char) => !/\s/.test(char) && !/[*_`~]/.test(char))
    .join('')
    .toLocaleLowerCase();
}

export function containsPreReviewQuote(content: string, quote: string) {
  if (content.includes(quote)) return true;
  const foldedQuote = foldPreReviewText(quote);
  return Boolean(foldedQuote && foldPreReviewText(content).includes(foldedQuote));
}

function normalizeSeverity(value: unknown): PreReviewSeverity {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium';
}

function resultMessageId(value: unknown) {
  const result = asObject(value);
  const messageId = result.messageId ?? result.message_id;
  return typeof messageId === 'string' ? messageId : '';
}

export function isPreReviewResultChecked(value: unknown) {
  const result = asObject(value);
  const status = typeof result.status === 'string'
    ? result.status
    : typeof result.review_status === 'string'
      ? result.review_status
      : '';
  if (result.checked === false) return false;
  return status !== 'missing_result' && status !== 'model_missing_result';
}

export function normalizePreReviewIssuesForMessage(
  message: PreReviewAssistantMessage,
  issueValues: unknown,
): Pick<NormalizedPreReviewResult, 'issues' | 'rawIssueCount' | 'ignoredIssueCount'> {
  const rawIssues = Array.isArray(issueValues) ? issueValues : [];
  const issues: NormalizedPreReviewIssue[] = [];
  const issueKeys = new Set<string>();

  for (const issueValue of rawIssues) {
    const issue = asObject(issueValue);
    const quote = typeof issue.quote === 'string' ? issue.quote.trim() : '';
    const label = typeof issue.label === 'string' ? issue.label.trim() : '';
    if (!quote || !label || !containsPreReviewQuote(message.content, quote)) continue;

    const normalizedIssue = {
      messageId: message.id,
      quote,
      label,
      severity: normalizeSeverity(issue.severity),
    };
    const key = `${normalizedIssue.quote}\u0000${normalizedIssue.label}`;
    if (issueKeys.has(key)) continue;
    issueKeys.add(key);
    issues.push(normalizedIssue);
  }

  return {
    issues: issues.slice(0, 4),
    rawIssueCount: rawIssues.length,
    ignoredIssueCount: Math.max(rawIssues.length - issues.length, 0),
  };
}

export function normalizePreReviewResults(
  assistantMessages: PreReviewAssistantMessage[],
  resultValues: unknown,
): NormalizedPreReviewResult[] {
  const assistantIds = new Set(assistantMessages.map((message) => message.id));
  const issuesByMessage = new Map<string, unknown[]>();

  if (Array.isArray(resultValues)) {
    for (const resultValue of resultValues) {
      const messageId = resultMessageId(resultValue);
      if (!assistantIds.has(messageId)) continue;
      const result = asObject(resultValue);
      const issueValues = Array.isArray(result.issues) ? result.issues : [];
      const current = issuesByMessage.get(messageId) ?? [];
      current.push(...issueValues);
      issuesByMessage.set(messageId, current);
    }
  }

  return assistantMessages.map((message) => {
    if (!issuesByMessage.has(message.id)) {
      return {
        messageId: message.id,
        status: 'missing_result',
        source: 'conversation',
        issues: [],
        rawIssueCount: 0,
        ignoredIssueCount: 0,
      };
    }

    return {
      messageId: message.id,
      status: 'checked',
      source: 'conversation',
      ...normalizePreReviewIssuesForMessage(message, issuesByMessage.get(message.id)),
    };
  });
}

export function toPreReviewMetadataResult(result: NormalizedPreReviewResult) {
  return {
    messageId: result.messageId,
    status: result.status,
    checked: result.status === 'checked',
    source: result.source,
    issues: result.issues,
    raw_issue_count: result.rawIssueCount,
    ignored_issue_count: result.ignoredIssueCount,
    ...(result.error ? { error: result.error } : {}),
  };
}
