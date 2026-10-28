import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiClient } from '@/services/api'
import { useGenerationStore } from './generation'

// 任务队列记录中心：
// - 右键生成的每个任务在这里有一条记录（队列顺序、来源文件、目标目录、进度）
// - 目录里"生成中"虚拟瓦片、托盘任务队列面板，都从这里的 views 读
// - 暂停/继续/删除统一走这里（转发到 generation store 的执行循环 + 写回数据库）
// - 页面刷新后 hydrate() 从数据库恢复未完成任务（execution_status = executing/paused），
//   恢复为"已暂停"状态，点播放从断点（progress_index）继续，已生成的图不会重复生成。
export const useTaskQueueStore = defineStore('taskQueue', () => {
  // 按入队顺序排列
  const records = ref([])
  const hydrated = ref(false)

  // 合并视图：内存执行状态（generation.taskExecution）优先，取不到用记录自身状态
  // running 判定完全信任调度器（currentTaskIndex 指向的任务才是真的在跑），
  // 恢复(继续)的任务只标 queued 排队等待，绝不提前显示成"执行中"
  const views = computed(() => {
    const gen = useGenerationStore()
    const ex = gen.taskExecution
    const liveProgress = gen.progress
    const tasks = (ex && Array.isArray(ex.tasks)) ? ex.tasks : []
    // 执行调度器正在驱动的当前任务（currentTaskIndex 指向的那一个）
    const curIdx = Number(ex && ex.currentTaskIndex)
    const curTask = (Number.isInteger(curIdx) && tasks[curIdx]) || null
    return records.value.map((rec) => {
      const t = tasks.find((x) => x && x.id === rec.taskId)
      if (t) {
        let status = 'queued'
        if (t.status === 'running' || t.status === 'loading') status = 'running'
        else if (t.status === 'pending') status = t.paused ? 'paused' : 'queued'
        else if (t.status === 'paused') status = 'paused'
        else if (t.status === 'completed') status = 'completed'
        else if (t.status === 'error') status = 'error'
        else if (t.status === 'cancelled') status = 'cancelled'
        // 本张进度只属于调度器当前驱动的任务；排队/暂停的任务一律 0（不共用全局进度造成"并行"假象）
        const isEngineCurrent = !!curTask && curTask.id === t.id
        return {
          ...rec,
          status,
          done: Number(t.completed) || 0,
          total: Number(t.total) || rec.total,
          livePct: (status === 'running' && isEngineCurrent) ? (Number(liveProgress) || 0) : 0,
          errorMessage: t.errorMessage || t.error_message || '',
        }
      }
      return {
        ...rec,
        status: rec.status || 'paused',
        livePct: 0,
        errorMessage: '',
      }
    })
  })

  // 面板排序：执行中 > 排队中 > 已暂停 > 出错 > 已完成（完成置底置灰），同组按入队顺序
  const sortedViews = computed(() => {
    const order = { running: 0, queued: 1, paused: 2, error: 3, cancelled: 4, completed: 5 }
    return views.value.slice().sort(
      (a, b) => ((order[a.status] ?? 9) - (order[b.status] ?? 9)) || (a.createdAt - b.createdAt)
    )
  })

  const activeCount = computed(() =>
    views.value.filter((r) => r.status === 'running' || r.status === 'queued').length
  )
  const finishedCount = computed(() =>
    views.value.filter((r) => r.status === 'completed' || r.status === 'error' || r.status === 'cancelled').length
  )

  function register(task, meta = {}) {
    const rec = {
      taskId: task.id,
      name: meta.name || task.name || `任务 #${task.id}`,
      fileName: meta.fileName || String(task.name || '').split(' · ')[0],
      funcName: meta.funcName || String(task.name || '').split(' · ')[1] || '',
      sourceFileId: meta.sourceFileId != null ? Number(meta.sourceFileId) : null,
      total: Number(task.total_count) || 0,
      done: Number(task.progress_index) || 0,
      status: 'queued',
      targetCategoryId: meta.targetCategoryId || 0,
      targetFolderId: meta.targetFolderId ?? null,
      createdAt: Date.now(),
    }
    records.value.push(rec)
    return rec
  }

  // 去重：同一个文件 + 同一个功能 + 同一个目标目录，队列里还有未跑完的就不允许重复发起
  function findPending(fileId, funcName, categoryId, folderId) {
    const fid = String(fileId ?? '')
    // 用 views（含实时状态）：已完成/出错/已取消的任务不算占用，可以重新发起
    return views.value.find((r) => {
      if (['completed', 'error', 'cancelled'].includes(r.status)) return false
      if (r.sourceFileId == null || String(r.sourceFileId) !== fid) return false
      if (funcName && r.funcName && r.funcName !== funcName) return false
      if ((r.targetCategoryId || 0) !== (Number(categoryId) || 0)) return false
      if ((r.targetFolderId ?? null) !== (folderId ?? null)) return false
      return true
    }) || null
  }

  // 刷新后恢复：数据库里 execution_status 为 executing/paused 的都是没跑完的
  // （completed/failed/idle 在执行过程中都会写回库）。浏览器刷新后执行驱动已丢失，
  // 一律显示为"已暂停"，用户点播放再从断点继续。
  async function hydrate() {
    if (hydrated.value) return
    hydrated.value = true
    try {
      const all = await apiClient.getGenerationTasks({})
      const unfinished = (all || []).filter((t) =>
        ['executing', 'paused'].includes(String(t.execution_status || ''))
      )
      if (!unfinished.length) return
      const gen = useGenerationStore()
      for (const t of unfinished) {
        if (records.value.some((r) => r.taskId === t.id)) continue
        // 正在本次会话里执行的任务不属于"刷新中断"，跳过
        if ((gen.taskExecution.tasks || []).some((x) => x && x.id === t.id)) continue
        const rec = {
          taskId: t.id,
          name: t.name || `任务 #${t.id}`,
          fileName: String(t.name || '').split(' · ')[0],
          funcName: String(t.name || '').split(' · ')[1] || '',
          total: 0, // 图片总数执行时才可知，懒加载计算
          done: Number(t.progress_index) || 0,
          status: 'paused',
          targetCategoryId: Number(t.target_category_id) || 0,
          targetFolderId: t.target_folder_id ?? null,
          createdAt: t.created_at ? new Date(t.created_at).getTime() : 0,
          interrupted: true, // 刷新前就在跑，被刷新中断
        }
        records.value.push(rec)
        // 数据库 execution_status 统一改成 paused（executing 是刷新前的残留）
        try { await apiClient.updateGenerationTask(t.id, { execution_status: 'paused' }) } catch (e) { /* ignore */ }
        // 懒算总图数：解析来源 Json 分镜文件里的提示词段数
        computeTotal(rec, gen)
      }
    } catch (e) { /* 网络失败不影响主流程 */ }
  }

  async function computeTotal(rec, gen) {
    try {
      let jsonIds = []
      const t = await apiClient.getGenerationTaskById(rec.taskId)
      if (!t) return
      try { jsonIds = typeof t.storyboard_json_ids === 'string' ? JSON.parse(t.storyboard_json_ids) : (t.storyboard_json_ids || []) } catch (e) { jsonIds = [] }
      if (jsonIds.length && rec.sourceFileId == null) rec.sourceFileId = Number(jsonIds[0]) || null
      let total = 0
      for (const jid of jsonIds) {
        const f = await apiClient.getFileLibraryFileById(jid)
        if (f && f.content) total += (gen.extractPromptsFromJson(f.content) || []).length
      }
      if (total) rec.total = total
    } catch (e) { /* 算不出来就等继续执行时从 live 拿 */ }
  }

  async function pauseTask(taskId) {
    const gen = useGenerationStore()
    const live = views.value.find((r) => r.taskId === taskId)
    if (live && (live.status === 'running' || live.status === 'queued') && gen.isGenerating) {
      await gen.pauseTask(taskId)
      return
    }
    const rec = records.value.find((r) => r.taskId === taskId)
    if (rec) rec.status = 'paused'
    try { await apiClient.updateGenerationTask(taskId, { execution_status: 'paused' }) } catch (e) { /* ignore */ }
  }

  async function resumeTask(taskId) {
    const gen = useGenerationStore()
    const ok = await gen.resumeTask(taskId)
    if (!ok) {
      // 内存里没有该任务（刷新后恢复的）：入队并加载任务详情，从断点继续
      await gen.enqueueTasks([taskId])
    } else {
      // 兜底：极少数情况下执行循环已退出但任务没被拉起，1.2s 后补一次
      setTimeout(() => {
        const live = (gen.taskExecution.tasks || []).find((x) => x && x.id === taskId)
        if (live && live.status !== 'running' && live.status !== 'loading' && !gen.isGenerating) {
          gen.resumeExecution().catch(() => {})
        }
      }, 1200)
    }
    // 数据库状态同步为执行中（刷新后 hydrate 才认得出）
    try { await apiClient.updateGenerationTask(taskId, { execution_status: 'executing' }) } catch (e) { /* ignore */ }
  }

  async function removeTask(taskId) {
    const gen = useGenerationStore()
    const t = (gen.taskExecution.tasks || []).find((x) => x && x.id === taskId)
    if (t && t.status !== 'completed' && t.status !== 'error') {
      // 标记取消 → 执行循环会跳过它，后面的任务自动顶上
      t.paused = true
      t.status = 'cancelled'
    }
    // 删除 = 任务记录一并从数据库移除（任务中心里也不再保留）
    try { await apiClient.deleteGenerationTask(taskId) } catch (e) { /* ignore */ }
    records.value = records.value.filter((r) => r.taskId !== taskId)
    // 广播：任务中心（若打开着）立即刷新列表，保持同步
    try { window.dispatchEvent(new CustomEvent('generation-tasks-changed')) } catch (e) { /* ignore */ }
  }

  // 反向同步：任务中心里删除任务后，仅移除本 store 的记录（数据库删除由调用方负责）
  function purgeRecord(taskId) {
    records.value = records.value.filter((r) => r.taskId !== taskId)
  }

  function clearFinished() {
    const doneIds = views.value
      .filter((r) => r.status === 'completed' || r.status === 'error' || r.status === 'cancelled')
      .map((r) => r.taskId)
    records.value = records.value.filter((r) => !doneIds.includes(r.taskId))
  }

  return { records, hydrated, views, sortedViews, activeCount, finishedCount, register, hydrate, findPending, pauseTask, resumeTask, removeTask, clearFinished, purgeRecord }
})
