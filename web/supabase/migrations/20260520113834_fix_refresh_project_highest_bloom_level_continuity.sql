-- 修复 refresh_project_highest_bloom_level：
-- 原实现取 MAX(target_bloom_level WHERE achieved)，不保证层级连续性。
-- 新实现取从 L1 开始连续通过的最高层级，与前端 buildChallengeProgress 逻辑一致。
CREATE OR REPLACE FUNCTION public.refresh_project_highest_bloom_level(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level integer;
  v_confirmed integer := 0;
BEGIN
  IF p_project_id IS NULL THEN RETURN; END IF;

  -- 从 L1 向上找连续通过的最高层级
  FOR v_level IN 1..6 LOOP
    IF EXISTS (
      SELECT 1 FROM public.practice_records
      WHERE project_id = p_project_id
        AND target_bloom_level = v_level
        AND achieved = true
        AND evaluation_state = 'evaluated'
    ) THEN
      v_confirmed := v_level;
    ELSE
      EXIT; -- 断层，停止
    END IF;
  END LOOP;

  UPDATE public.text_projects
  SET highest_bloom_level = CASE WHEN v_confirmed > 0 THEN v_confirmed ELSE NULL END
  WHERE id = p_project_id;
END;
$$;
