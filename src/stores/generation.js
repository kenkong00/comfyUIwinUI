import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useConfigStore } from './config'
import { defaultWorkflow } from '@/config/workflow'
import { apiClient } from '@/services/api'

// 下载服务地址：开发环境走 vite 同源代理 /dl（见 vite.config.js）
const DOWNLOAD_SERVER_URL = '/dl'

export const useGenerationStore = defineStore('generation', () => {
  const isGenerating = ref(false)
  const generationStatus = ref('待命状态...')
  const error = ref('')
  const progress = ref(0)
  const currentPromptId = ref('')
  const results = ref([])
  const allImagesVisible = ref(false)
  const copyStatus = ref({})
  const generationOptions = ref({
    prompt: '',
    batchCount: 1
  })
  const storyboardPrompts = ref([])
  const parsedStoryboards = ref([])
  const jsonSaveMessage = ref('')
  const hasSelectedFile = ref(false)

  const cancelling = ref(false)
  const currentBatchJobId = ref(null)
  const batchQueue = ref([])
  const batchCategory = ref('multi-character')
  const batchWorkflowApiId = ref(0)
  const completedCount = ref(0)
  const selectedWorkflowApiId = ref(0)

  // 待加载到功能测试的功能任务单元（从文件库点击编辑时设置）
  // { fileId, name, tabId, functionName, promptText, insertedPromptIds, selectedWorkflowId, comfyuiConfigId, videoParams, imageParams, showVideoParams, showImageParams }
  const pendingFunctionUnit = ref(null)
  function setPendingFunctionUnit(unit) {
    pendingFunctionUnit.value = unit
  }

  // 右侧筛选窗的选项卡：'files' | 'executing'
  const rightPanelTab = ref('files')
  function setRightPanelTab(tab) {
    rightPanelTab.value = tab
  }
  function clearPendingFunctionUnit() {
    pendingFunctionUnit.value = null
  }

  // 任务批量执行状态
  const taskExecution = ref({
    running: false,
    tasks: [],          // [{ id, name, status, total, completed, workflow_api_id, prompts: [], paused, progressIndex }]
    currentTaskIndex: -1,
    overallCompleted: 0,
    overallTotal: 0
  })

  const validateWorkflow = (workflowToValidate) => {
    for (const [nodeId, node] of Object.entries(workflowToValidate)) {
      if (!node.class_type) {
        console.warn(`节点 ${nodeId} (${node._meta?.title || nodeId}) 缺少 class_type`)
        return false
      }
    }
    return true
  }

  const updateWorkflow = (workflowToUse, prompt, batchCount = 1, promptNodeId = null, filenamePrefixOverride = null) => {
    const configStore = useConfigStore()
    let workflowToUpdate = workflowToUse

    if (!validateWorkflow(workflowToUse)) {
      console.warn('工作流验证失败，使用默认工作流')
      workflowToUpdate = defaultWorkflow
    }

    const updatedWorkflow = JSON.parse(JSON.stringify(workflowToUpdate))

    let promptSet = false
    // 优先使用用户指定的提示词节点 ID
    // 注意：CLIPTextEncode 等节点用 "text" 字段，
    // 而 PrimitiveStringMultiline / INTConstant 等常量节点用 "value" 字段
    if (promptNodeId) {
      const id = String(promptNodeId)
      const node = updatedWorkflow[id]
      if (node && node.inputs) {
        if ('text' in node.inputs) {
          node.inputs.text = prompt
          promptSet = true
          console.log(`使用用户指定节点 ${id} 的 text 字段设置提示词`)
        } else if ('value' in node.inputs) {
          node.inputs.value = prompt
          promptSet = true
          console.log(`使用用户指定节点 ${id} 的 value 字段设置提示词（常量节点）`)
        } else {
          console.warn(`用户指定节点 ${id} 没有 text 或 value 输入，可用字段: ${Object.keys(node.inputs).join(', ')}`)
        }
      } else {
        console.warn(`用户指定节点 ${id} 不存在`)
      }
    }
    if (!promptSet) {
      if (updatedWorkflow["109"] && updatedWorkflow["109"].inputs && 'text' in updatedWorkflow["109"].inputs) {
        updatedWorkflow["109"].inputs.text = prompt
        promptSet = true
        console.log('使用节点109设置提示词')
      } else {
        console.warn('节点109不存在或没有text输入，尝试查找其他文本输入节点')
        for (const [nodeId, node] of Object.entries(updatedWorkflow)) {
          if (node && node.inputs && 'text' in node.inputs) {
            console.log(`使用节点 ${nodeId} (${node.class_type || 'unknown'}) 作为提示词输入节点`)
            node.inputs.text = prompt
            promptSet = true
            break
          }
        }
      }
    }
    
    if (!promptSet) {
      console.error('警告：未能找到任何可设置提示词的节点！')
      const newNodeId = 'prompt_input_' + Date.now()
      updatedWorkflow[newNodeId] = {
        inputs: { text: prompt },
        class_type: 'Text Multiline',
        _meta: { title: 'Prompt Input' }
      }
    }
    
    if (updatedWorkflow["84"] && updatedWorkflow["84"].inputs) {
      updatedWorkflow["84"].inputs.batch_size = batchCount
    }
    
    Object.values(updatedWorkflow).forEach(node => {
      if (node && node.class_type === 'SaveImage' && node.inputs) {
        node.inputs.filename_prefix = filenamePrefixOverride || configStore.config.filenamePrefix || 'ComfyUI'
      }
    })

    // 为采样器节点设置随机种子，避免相同提示词连续执行时 ComfyUI 使用缓存导致任务卡住
    // 参考: https://www.cnblogs.com/zer0Black/p/19484326
    Object.values(updatedWorkflow).forEach(node => {
      if (!node || !node.inputs || !node.class_type) return
      const cls = node.class_type.toLowerCase()
      // KSamplerAdvanced 用 noise_seed，KSampler 用 seed
      if ('noise_seed' in node.inputs && cls.includes('sampler')) {
        node.inputs.noise_seed = Math.floor(Math.random() * 1125899906842624)
      } else if ('seed' in node.inputs && cls.includes('sampler')) {
        node.inputs.seed = Math.floor(Math.random() * 1125899906842624)
      }
    })

    return updatedWorkflow
  }

  const sendGenerateRequest = async (updatedWorkflow, apiBaseOverride) => {
    const configStore = useConfigStore()
    const outputDir = 'outputs'
    const apiBase = apiBaseOverride || configStore.getApiBaseUrl()
    const response = await fetch(`${apiBase}prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: updatedWorkflow,
        output_dir: outputDir
      })
    })
    
    if (!response.ok) {
      let errorMessage = `API请求失败: ${response.status} ${response.statusText}`
      try {
        const errorText = await response.text()
        errorMessage = `${errorMessage}: ${errorText}`
      } catch (e) {
        errorMessage = `${errorMessage}: 无法读取响应内容`
      }
      throw new Error(errorMessage)
    }
    
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text()
      throw new Error(`API返回非JSON响应: ${responseText}`)
    }
    
    const responseText = await response.text()
    if (!responseText) {
      throw new Error('API返回空响应')
    }
    
    try {
      const data = JSON.parse(responseText)
      const promptId = data.prompt_id
      if (!promptId) {
        throw new Error('未获取到任务ID')
      }
      return promptId
    } catch (e) {
      throw new Error(`JSON解析失败: ${e.message}. 响应内容: ${responseText}`)
    }
  }

  const pollTaskStatus = async (promptId, apiBaseOverride) => {
    const configStore = useConfigStore()
    let isCompleted = false
    let attempts = 0
    const maxAttempts = 600
    const apiBase = apiBaseOverride || configStore.getApiBaseUrl()
    
    currentPromptId.value = promptId
    progress.value = 0
    
    const startTime = Date.now()

    while (!isCompleted && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const elapsed = Date.now() - startTime
      
      try {
        const [queueRes, historyRes] = await Promise.allSettled([
          fetch(`${apiBase}queue`),
          fetch(`${apiBase}history`)
        ])

        if (historyRes.status === 'fulfilled' && historyRes.value.ok) {
          try {
            const historyData = await historyRes.value.json()
            if (historyData[promptId]) {
              const promptHistory = historyData[promptId]
              // 检测执行错误（如显存不足），立即抛出
              if (promptHistory.status && promptHistory.status.status_str === 'error') {
                const msgs = promptHistory.status.messages || []
                const errMsg = msgs.map(m => (m && m[1]) ? (typeof m[1] === 'string' ? m[1] : (m[1].exception_message || m[1].error || JSON.stringify(m[1]))) : '').filter(Boolean).join('; ')
                throw new Error(errMsg || 'ComfyUI 执行出错（可能显存不足或节点异常）')
              }
              if (promptHistory.outputs) {
                let hasOutputs = false
                for (const output of Object.values(promptHistory.outputs)) {
                  // 图片输出
                  if (output.images && output.images.length > 0) {
                    hasOutputs = true
                    for (const image of output.images) {
                      try {
                        const imageUrl = `${apiBase}/view?filename=${image.filename}&subfolder=${image.subfolder || ''}&type=output`
                        const lowerFn = (image.filename || '').toLowerCase()
                        const isVideo = lowerFn.endsWith('.mp4') || lowerFn.endsWith('.webm') || lowerFn.endsWith('.webp') || lowerFn.endsWith('.gif')
                        const newItem = {
                          url: imageUrl,
                          filename: image.filename,
                          loaded: false,
                          showInfo: false,
                          prompt: image.prompt || '',
                          isVideo,
                          thumbUrl: ''
                        }
                        results.value.push(newItem)
                        // 异步生成缩略图（用于生成进度面板的小图显示，避免渲染 10M 原图）
                        if (!isVideo) {
                          compressThumbnail(imageUrl).then(thumb => {
                            if (thumb) newItem.thumbUrl = thumb
                          })
                        }
                      } catch (e) { console.error('处理图片失败:', e) }
                    }
                  }
                  // 视频输出（VHS_VideoCombine 等节点输出 gifs 字段）
                  if (output.gifs && output.gifs.length > 0) {
                    hasOutputs = true
                    for (const gif of output.gifs) {
                      try {
                        // VHS 节点 save_output=false 时文件在 temp 文件夹，type 字段会指明位置
                        const fileType = gif.type || 'output'
                        const videoUrl = `${apiBase}/view?filename=${encodeURIComponent(gif.filename)}&subfolder=${encodeURIComponent(gif.subfolder || '')}&type=${fileType}`
                        console.log('视频输出:', gif, '-> URL:', videoUrl)
                        results.value.push({
                          url: videoUrl,
                          filename: gif.filename,
                          loaded: false,
                          showInfo: false,
                          prompt: gif.prompt || '',
                          isVideo: true
                        })
                      } catch (e) { console.error('处理视频失败:', e) }
                    }
                  }
                }
                if (hasOutputs) {
                  isCompleted = true
                  progress.value = 100
                  generationStatus.value = `生成完成! (${Math.round(elapsed/1000)}s)`
                  setTimeout(() => { if (progress.value === 100) progress.value = 0 }, 3000)
                  break
                }
              }
            }
          } catch (parseErr) {
            if (parseErr.message && (parseErr.message.includes('ComfyUI') || parseErr.message.includes('显存') || parseErr.message.includes('执行'))) {
              throw parseErr
            }
          }
        }

        if (queueRes.status === 'fulfilled' && queueRes.value.ok) {
          try {
            const queueData = await queueRes.value.json()
            const runningList = queueData.queue_running || []
            const runningItem = runningList.find(
              item => item.prompt_id === promptId || (item[1] && item[1].prompt_id === promptId) || (item[0] && Array.isArray(item[0]) && item[0][0] === promptId)
            )
            
            if (runningItem) {
              let statusInfo = runningItem.status || (runningItem[2] || {})
              if (statusInfo.status_str === 'error') {
                throw new Error(statusInfo.messages ? statusInfo.messages.join(', ') : 'ComfyUI 执行错误')
              }
              
              const extraData = runningItem.extra || (runningItem[3] || {})
              if (extraData && extraData.node_stats) {
                const stats = extraData.node_stats
                const completed = stats.completed || 0
                const total = stats.total || Object.keys(stats).length || 10
                progress.value = Math.min(95, Math.round((completed / Math.max(total, 1)) * 90))
              } else {
                const sec = elapsed / 1000
                let p
                if (sec < 0.8) p = sec * 40
                else if (sec < 1.8) p = 32 + (sec - 0.8) * 35
                else if (sec < 3) p = 67 + (sec - 1.8) * 20
                else if (sec < 4) p = 87 + (sec - 3) * 5
                else p = Math.min(92, 92 + (sec - 4) * 1)
                p += Math.random() * 1.5
                progress.value = Math.max(progress.value, Math.min(92, Math.round(p)))
              }
              
              generationStatus.value = `正在生成中... ${progress.value}% (${Math.round(elapsed/1000)}s)`
            } else {
              if (runningList.length > 0) {
                progress.value = Math.min(96, progress.value + 12)
              } else {
                progress.value = Math.min(99, progress.value + 18)
              }
            }
          } catch (qErr) {}
        } else {
          const sec = elapsed / 1000
          const fallbackP = Math.min(90, sec < 3 ? Math.round(sec * 30) : Math.round(90 + (sec - 3) * 2))
          progress.value = Math.max(progress.value, fallbackP)
        }
      } catch (e) {
        if (!e.message.includes('ComfyUI')) console.error('状态查询错误:', e)
        else throw e
      }
      attempts++
    }
    
    currentPromptId.value = ''
    
    if (!isCompleted) {
      progress.value = 0
      throw new Error('生成超时')
    }
  }

  const resetProgress = () => {
    progress.value = 0
    currentPromptId.value = ''
  }

  // 用 canvas 压缩图片为缩略图 base64（避免存储原图 10M 大图）
  // 使用 fetch + blob 方式加载图片，避免 canvas 被 cross-origin 污染导致 toDataURL 抛错
  const compressThumbnail = async (url, maxSize = 300) => {
    try {
      const resp = await fetch(url)
      if (!resp.ok) return ''
      const blob = await resp.blob()
      const objectUrl = URL.createObjectURL(blob)
      return await new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          URL.revokeObjectURL(objectUrl)
          let { width, height } = img
          if (width > height) {
            if (width > maxSize) { height = height * maxSize / width; width = maxSize }
          } else {
            if (height > maxSize) { width = width * maxSize / height; height = maxSize }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          try {
            resolve(canvas.toDataURL('image/jpeg', 0.7))
          } catch (e) {
            resolve('')
          }
        }
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          resolve('')
        }
        img.src = objectUrl
      })
    } catch (e) {
      return ''
    }
  }

  const saveImageToDirectory = async (imageArray, subdir = null) => {
    const configStore = useConfigStore()
    if (imageArray.length === 0) return

    try {
      generationStatus.value = '正在保存图片...'

      // 当前登录用户名（用于账号隔离的下载目录）
      const username = apiClient.user?.username || ''

      // 未登录时给出明显警告（仍允许保存到全局目录，避免数据丢失）
      if (!username) {
        console.warn('[saveImageToDirectory] ⚠️ 未获取到登录用户名，图片将保存到全局目录而非账号私有目录。请检查登录状态或重启后端服务。')
      }

      // 日期目录固定用"当天"——此前取配置里的 download_dir，存的是过期值（如 20260718），
      // 会把今天的图片存进历史日期目录，硬盘里按日期找不到。
      const now = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      const clientDir = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`

      if (clientDir || username) {
        await fetch(`${DOWNLOAD_SERVER_URL}/api/set-download-dir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: clientDir, username })
        })
      }

      const images = imageArray.map(r => ({
        imageUrl: r.url,
        filename: r.filename || `image_${Date.now()}.png`
      }))

      const response = await fetch(`${DOWNLOAD_SERVER_URL}/api/download-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          comfyuiUrl: configStore.config.comfyuiUrl,
          subdir,
          username,
          downloadDir: clientDir
        })
      })

      const data = await response.json()
      const savedPaths = []
      if (data.success) {
        const successCount = data.results.filter(r => r.success).length
        if (successCount > 0) {
          generationStatus.value = `已保存 ${successCount} 张图片到 ${data.downloadDir}`
        }
        // 收集成功保存的文件绝对路径，供调用方记录（如对话删除时清理）
        data.results.forEach(r => {
          if (r.success && r.filepath) savedPaths.push(r.filepath)
        })
      } else {
        generationStatus.value = `保存失败: ${data.error}`
      }
      return savedPaths
    } catch (e) {
      generationStatus.value = `保存失败: ${e.message}`
      return []
    }
  }

  // 把一张刚生成的任务结果图持久化到文件库（总库/任务名/），生成一张出现一张。
  // 链路 0（首选）：浏览器拉图 base64 直传 upload-to-library —— 远程 ComfyUI（如 CNB）带认证时
  //   服务端直连拉图会 401，而浏览器通过本地代理一定能拿到图；服务端只负责落盘+登记。
  // 链路 1（兜底）：图片经下载服务(3006)落盘 user_data，再 register-to-library 登记 DB；
  // 链路 2（兜底）：API 服务(3007)从【本地】ComfyUI 拉图写入总库。
  // 磁盘布局：server/user_data/<用户名>/downloads/<yyyyMMdd>/<任务名>/<文件名>
  // 返回 true 表示已在文件库可见。
  const persistTaskResultToLibrary = async (task, latestResult, comfyuiUrl) => {
    if (!latestResult) return false
    const item = {
      filename: latestResult.filename,
      prompt: latestResult.prompt || '',
      isVideo: !!latestResult.isVideo,
      thumbnail: latestResult.thumbnail || ''
    }
    // 链路 0：浏览器直传（blob: 对象 URL 浏览器自己也能 fetch）
    if (latestResult.url) {
      try {
        const resp = await fetch(latestResult.url)
        if (resp.ok) {
          const blob = await resp.blob()
          const b64 = await new Promise((resolve) => {
            const fr = new FileReader()
            fr.onload = () => resolve(fr.result)
            fr.onerror = () => resolve('')
            fr.readAsDataURL(blob)
          })
          if (b64) {
            const r = await apiClient.uploadTaskResultsToLibrary(task.id, [{ ...item, dataBase64: b64 }])
            if (r && r.success && (r.savedCount || 0) + (r.skippedCount || 0) > 0) {
              latestResult.savedPath = (Array.isArray(r.saved) && r.saved[0]) || ''
              if (latestResult.savedPath) {
                latestResult.url = `${DOWNLOAD_SERVER_URL}/api/serve-file?path=${encodeURIComponent(latestResult.savedPath)}`
              }
              return true
            }
            if (r && r.errors && r.errors.length) console.warn('[persistTaskResult] 直传错误:', r.errors)
          }
        }
      } catch (e) {
        console.warn('[persistTaskResult] 浏览器直传失败，改走服务端链路:', e)
      }
    }
    const full = { ...item, url: latestResult.url || '', savedPath: latestResult.savedPath || '' }
    // 链路 1：下载服务落盘 + 登记
    if (!full.savedPath) {
      try {
        const savedPaths = await saveImageToDirectory([latestResult], task.name)
        if (savedPaths && savedPaths.length > 0) {
          full.savedPath = savedPaths[0]
          latestResult.savedPath = savedPaths[0]
          latestResult.url = `${DOWNLOAD_SERVER_URL}/api/serve-file?path=${encodeURIComponent(savedPaths[0])}`
        }
      } catch (e) {
        console.warn('[persistTaskResult] 保存到用户目录失败:', e)
      }
    }
    if (full.savedPath) {
      try {
        await apiClient.registerTaskResultsToLibrary(task.id, [full])
        return true
      } catch (e) {
        console.warn('[persistTaskResult] 登记到文件库失败，改用服务端直存:', e)
      }
    }
    // 链路 2：服务端直接从本地 ComfyUI 拉图写入总库
    if (full.url) {
      try {
        const r = await apiClient.saveTaskResultsToLibrary(task.id, [full], comfyuiUrl)
        if (r && r.success && (r.savedCount || 0) > 0) return true
        if (r && r.success && (r.skippedCount || 0) > 0) return true // 已存在（去重跳过）
        const detail = r && Array.isArray(r.errors) && r.errors.length ? r.errors.join('; ') : (r && r.error) || '未知原因'
        console.error('[persistTaskResult] 服务端直存失败:', detail)
        generationStatus.value = `写入总库失败：${detail}`
      } catch (e) {
        console.error('[persistTaskResult] 服务端直存失败:', e)
        generationStatus.value = `写入总库失败：${e.message || e}`
      }
    }
    return false
  }

  const generate = async ({ imageParams } = {}) => {
    if (!generationOptions.value.prompt) {
      error.value = '请输入提示词'
      return
    }

    const configStore = useConfigStore()
    // 注意：功能测试不修改全局 isGenerating，避免与批量任务执行互相禁用（ComfyUI 支持排队）
    error.value = ''
    // 单次测试生成：不清空已有结果，累积保留（只要页面不刷新，之前生成的数据仍保留）
    const startLen = results.value.length
    generationStatus.value = '准备生成...'

    try {
      let workflowToUse = configStore.customWorkflow || defaultWorkflow
      if (selectedWorkflowApiId.value > 0) {
        try {
          const wfFile = await apiClient.getFileLibraryFileById(selectedWorkflowApiId.value)
          if (wfFile && wfFile.content) {
            workflowToUse = typeof wfFile.content === 'string'
              ? JSON.parse(wfFile.content)
              : wfFile.content
          }
        } catch (e) {
          console.warn('加载指定工作流失败，使用默认:', e)
        }
      }

      // 注入图片参数（宽/高节点），仅当用户配置了节点 ID 时才设置（默认空不影响工作流）
      let workflowCopy = workflowToUse
      if (imageParams && typeof imageParams === 'object') {
        workflowCopy = JSON.parse(JSON.stringify(workflowToUse))
        const setNodeInput = (nodeId, inputName, value) => {
          if (!nodeId) return false
          const id = String(nodeId)
          const node = workflowCopy[id]
          if (node && node.inputs) {
            if (inputName in node.inputs) {
              node.inputs[inputName] = value
              return true
            }
            if ('value' in node.inputs) {
              node.inputs.value = value
              return true
            }
            return false
          }
          return false
        }
        if (imageParams.widthNodeId && imageParams.width != null && imageParams.width !== '') {
          setNodeInput(imageParams.widthNodeId, 'width', Number(imageParams.width) || 512)
        }
        if (imageParams.heightNodeId && imageParams.height != null && imageParams.height !== '') {
          setNodeInput(imageParams.heightNodeId, 'height', Number(imageParams.height) || 512)
        }
      }

      const updatedWorkflow = updateWorkflow(workflowCopy, generationOptions.value.prompt, generationOptions.value.batchCount)

      generationStatus.value = '发送生成请求...'
      const promptId = await sendGenerateRequest(updatedWorkflow)

      generationStatus.value = '等待图片生成完成...'
      await pollTaskStatus(promptId)

      if (results.value.length === startLen) {
        throw new Error('未收到任何图片数据，请检查ComfyUI配置')
      }

      // 仅给本次新增的结果设置 prompt（不影响之前累积的结果）
      for (let i = startLen; i < results.value.length; i++) {
        results.value[i].prompt = generationOptions.value.prompt
        results.value[i].showInfo = false
      }

      if (configStore.config.autoDownload && results.value.length > 0) {
        await saveImageToDirectory(results.value.slice(startLen))
      }

      generationStatus.value = '生成完成!'
    } catch (err) {
      error.value = `生成失败: ${err.message}。请确保ComfyUI服务正在运行，地址正确。`
    }
  }

  // 上传图片到 ComfyUI（用于图生图/图生视频）
  const uploadImageToComfyUI = async (imageBase64) => {
    const configStore = useConfigStore()
    const apiBase = configStore.getApiBaseUrl()
    // 将 data URL 转为 Blob
    const arr = imageBase64.split(',')
    const mime = arr[0].match(/:(.*?);/)[1] || 'image/png'
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) u8arr[n] = bstr.charCodeAt(n)
    const blob = new Blob([u8arr], { type: mime })
    const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg')
    const filename = `input_${Date.now()}.${ext}`
    const formData = new FormData()
    formData.append('image', blob, filename)

    const resp = await fetch(`${apiBase}upload/image`, {
      method: 'POST',
      body: formData
    })
    if (!resp.ok) {
      throw new Error(`上传图片到 ComfyUI 失败: ${resp.status}`)
    }
    const data = await resp.json()
    return data.name || filename
  }

  // 将输入图片上传到 ComfyUI 并设置到工作流对应节点（供功能任务单元批量执行复用）
  // slots: [{ base64, nodeId }]，nodeId 可为 null（回退到下一个可用 LoadImage 节点）
  // 注意：传入的 workflowCopy 必须是可变副本（会就地修改）
  const applyInputImagesToWorkflow = async (workflowCopy, slots) => {
    if (!Array.isArray(slots) || slots.length === 0) return
    generationStatus.value = '上传图片到 ComfyUI...'
    for (let i = 0; i < slots.length; i++) {
      const { base64, nodeId } = slots[i]
      if (!base64) continue
      const uploadedName = await uploadImageToComfyUI(base64)
      let setOk = false
      if (nodeId && workflowCopy[nodeId]) {
        const node = workflowCopy[nodeId]
        if (node && node.inputs) {
          node.inputs.image = uploadedName
          node._uploaded = true
          setOk = true
          console.log(`[批量] 已设置节点 ${nodeId} 的 image 为 ${uploadedName}`)
        }
      }
      if (!setOk) {
        // 回退：找下一个未设置的 LoadImage 节点
        for (const [nid, node] of Object.entries(workflowCopy)) {
          if (node && node.class_type === 'LoadImage' && node.inputs && node.inputs.image !== undefined) {
            if (node._uploaded) continue
            node.inputs.image = uploadedName
            node._uploaded = true
            setOk = true
            console.log(`[批量] 回退设置 LoadImage 节点 ${nid} 的 image 为 ${uploadedName}`)
            break
          }
        }
        if (!setOk) {
          console.warn(`[批量] 第 ${i + 1} 张图片未找到可用节点，已跳过`)
        }
      }
    }
    // 清理临时标记
    for (const node of Object.values(workflowCopy)) {
      if (node && node._uploaded) delete node._uploaded
    }
  }

  // 图生图 / 图生视频：在指定工作流中上传图片并设置对应节点
  // inputImageSlots: [{ base64, nodeId }] 每项包含图片和对应节点 ID（nodeId 可为 null，回退 LoadImage）
  // 向后兼容 inputImages + imageNodeIds / inputImageBase64
  const generateWithImage = async ({ prompt, workflowApiId, inputImageSlots, inputImageBase64, inputImages, imageNodeIds, videoParams, batchCount = 1 }) => {
    if (!prompt) {
      error.value = '请输入提示词'
      return
    }
    // 构建统一的 slots 数组
    let slots = []
    if (Array.isArray(inputImageSlots) && inputImageSlots.length > 0) {
      slots = inputImageSlots
    } else if (Array.isArray(inputImages) && inputImages.length > 0) {
      const nids = Array.isArray(imageNodeIds) ? imageNodeIds : null
      slots = inputImages.map((b64, i) => ({ base64: b64, nodeId: nids ? nids[i] : null }))
    } else if (inputImageBase64) {
      slots = [{ base64: inputImageBase64, nodeId: null }]
    }
    if (slots.length === 0 && !videoParams) {
      error.value = '请提供输入图片'
      return
    }

    const configStore = useConfigStore()
    // 注意：功能测试不修改全局 isGenerating，避免与批量任务执行互相禁用（ComfyUI 支持排队）
    error.value = ''
    // 单次测试生成：不清空已有结果，累积保留（只要页面不刷新，之前生成的数据仍保留）
    const startLen = results.value.length
    generationStatus.value = '准备生成...'

    try {
      let workflowToUse = configStore.customWorkflow || defaultWorkflow
      const wfId = workflowApiId || selectedWorkflowApiId.value
      if (wfId && wfId > 0) {
        try {
          const wfFile = await apiClient.getFileLibraryFileById(wfId)
          if (wfFile && wfFile.content) {
            workflowToUse = typeof wfFile.content === 'string'
              ? JSON.parse(wfFile.content)
              : wfFile.content
          }
        } catch (e) {
          console.warn('加载指定工作流失败，使用默认:', e)
        }
      }

      const workflowCopy = JSON.parse(JSON.stringify(workflowToUse))

      // 上传每张图片并设置对应节点
      generationStatus.value = '上传图片到 ComfyUI...'
      for (let i = 0; i < slots.length; i++) {
        const { base64, nodeId } = slots[i]
        const uploadedName = await uploadImageToComfyUI(base64)
        let setOk = false
        if (nodeId && workflowCopy[nodeId]) {
          const node = workflowCopy[nodeId]
          if (node && node.inputs) {
            node.inputs.image = uploadedName
            node._uploaded = true
            setOk = true
            console.log(`已设置节点 ${nodeId} 的 image 为 ${uploadedName}`)
          }
        }
        if (!setOk) {
          // 回退：找下一个未设置的 LoadImage 节点
          for (const [nid, node] of Object.entries(workflowCopy)) {
            if (node && node.class_type === 'LoadImage' && node.inputs && node.inputs.image !== undefined) {
              if (node._uploaded) continue
              node.inputs.image = uploadedName
              node._uploaded = true
              setOk = true
              console.log(`回退设置 LoadImage 节点 ${nid} 的 image 为 ${uploadedName}`)
              break
            }
          }
          if (!setOk) {
            console.warn(`第 ${i + 1} 张图片未找到可用节点，已跳过`)
          }
        }
      }
      // 清理临时标记
      for (const node of Object.values(workflowCopy)) {
        if (node && node._uploaded) delete node._uploaded
      }

      // 注入视频参数（宽/高/长度/帧率/文生视频开关），按用户配置的节点 ID 设置
      // ComfyUI 中 INTConstant/PrimitiveFloat/PrimitiveBoolean/PrimitiveStringMultiline 等常量节点
      // 的输入字段名都是 "value"，而不是 "width"/"height" 等，因此这里智能匹配：
      // 优先用传入的 inputName（兼容普通节点），若不存在则回退到 "value"（兼容常量节点）
      if (videoParams && typeof videoParams === 'object') {
        const setNodeInput = (nodeId, inputName, value) => {
          if (!nodeId) return false
          const id = String(nodeId)
          const node = workflowCopy[id]
          if (node && node.inputs) {
            if (inputName in node.inputs) {
              node.inputs[inputName] = value
              console.log(`已设置节点 ${id} 的 ${inputName} = ${value}`)
              return true
            }
            if ('value' in node.inputs) {
              node.inputs.value = value
              console.log(`已设置节点 ${id} 的 value = ${value}（常量节点，字段名 value）`)
              return true
            }
            console.warn(`节点 ${id} 没有 ${inputName} 或 value 输入，可用字段: ${Object.keys(node.inputs).join(', ')}`)
            return false
          }
          console.warn(`节点 ${id} 不存在或无 inputs，跳过设置 ${inputName}`)
          return false
        }
        if (videoParams.widthNodeId) setNodeInput(videoParams.widthNodeId, 'width', Number(videoParams.width) || 512)
        if (videoParams.heightNodeId) setNodeInput(videoParams.heightNodeId, 'height', Number(videoParams.height) || 512)
        if (videoParams.lengthNodeId) setNodeInput(videoParams.lengthNodeId, 'length', Number(videoParams.length) || 25)
        if (videoParams.fpsNodeId) setNodeInput(videoParams.fpsNodeId, 'fps', Number(videoParams.fps) || 8)
        if (videoParams.t2vNodeId) setNodeInput(videoParams.t2vNodeId, 'text_to_video', videoParams.textToVideo ? true : false)
      }

      const updatedWorkflow = updateWorkflow(workflowCopy, prompt, batchCount, videoParams ? videoParams.promptNodeId : null)

      generationStatus.value = '发送生成请求...'
      const promptId = await sendGenerateRequest(updatedWorkflow)

      generationStatus.value = '等待生成完成...'
      await pollTaskStatus(promptId)

      if (results.value.length === startLen) {
        throw new Error('未收到任何输出数据，请检查ComfyUI配置')
      }

      // 仅给本次新增的结果设置 prompt（不影响之前累积的结果）
      for (let i = startLen; i < results.value.length; i++) {
        results.value[i].prompt = prompt
        results.value[i].showInfo = false
      }

      generationStatus.value = '生成完成!'
    } catch (err) {
      error.value = `生成失败: ${err.message}。请确保ComfyUI服务正在运行，地址正确。`
    }
  }

  const batchGenerate = async () => {
    if (batchQueue.value.length === 0) {
      error.value = '请添加分镜任务到队列'
      return
    }
    
    const configStore = useConfigStore()
    isGenerating.value = true
    error.value = ''
    results.value = []
    completedCount.value = 0
    
    try {
      // Create a batch job in DB
      const jobData = {
        category: batchCategory.value,
        name: `批量生成 ${new Date().toLocaleString('zh-CN')}`,
        workflow_api_id: batchWorkflowApiId.value,
        storyboards: batchQueue.value
      }
      
      let dbJob = null
      if (apiClient.isLoggedIn()) {
        try {
          dbJob = await apiClient.createBatchJob(jobData)
          if (dbJob) currentBatchJobId.value = dbJob.id
        } catch (e) {
          console.warn('创建数据库任务失败，继续本地生成:', e)
        }
      }
      
      for (let i = 0; i < batchQueue.value.length; i++) {
        if (!isGenerating.value) {
          generationStatus.value = '批量生成已停止'
          break
        }
        
        const item = batchQueue.value[i]
        const prompt = item.prompt || item
        generationStatus.value = `正在生成第 ${i + 1}/${batchQueue.value.length} 个分镜...`
        
        // Get workflow - use selected workflow API or current custom workflow
        let workflowToUse = configStore.customWorkflow || defaultWorkflow
        if (batchWorkflowApiId.value > 0) {
          try {
            const wfFile = await apiClient.getFileLibraryFileById(batchWorkflowApiId.value)
            if (wfFile && wfFile.content) {
              workflowToUse = typeof wfFile.content === 'string'
                ? JSON.parse(wfFile.content)
                : wfFile.content
            }
          } catch (e) {
            console.warn('加载指定工作流失败，使用默认:', e)
          }
        }
        
        const updatedWorkflow = updateWorkflow(workflowToUse, prompt)
        const promptId = await sendGenerateRequest(updatedWorkflow)
        await pollTaskStatus(promptId)
        
        completedCount.value = i + 1
        
        // Update DB job progress
        if (dbJob) {
          try {
            await apiClient.updateBatchJob(dbJob.id, {
              status: 'running',
              current_index: i,
              completed_count: completedCount.value,
              results: results.value.map(r => ({ url: r.url, prompt: r.prompt }))
            })
          } catch (e) { /* ignore */ }
        }
        
        if (configStore.config.autoDownload && results.value.length > 0) {
          const latestResult = results.value[results.value.length - 1]
          latestResult.prompt = prompt
          await saveImageToDirectory([latestResult])
        }
      }
      
      // Mark job as completed
      if (dbJob) {
        try {
          await apiClient.updateBatchJob(dbJob.id, {
            status: isGenerating.value ? 'completed' : 'cancelled',
            completed_count: completedCount.value,
            results: results.value.map(r => ({ url: r.url, prompt: r.prompt }))
          })
        } catch (e) { /* ignore */ }
      }
      
      currentBatchJobId.value = null
      generationStatus.value = isGenerating.value ? '批量生成完成!' : '批量生成已停止'
    } catch (err) {
      error.value = `批量生成失败: ${err.message}`
      if (currentBatchJobId.value) {
        try {
          await apiClient.updateBatchJob(currentBatchJobId.value, { status: 'error', error: err.message })
        } catch (e) { /* ignore */ }
      }
      currentBatchJobId.value = null
    } finally {
      isGenerating.value = false
    }
  }

  // 批量推理：根据 function config 调用 AI 推理批量提示词，转换为 JSON 分镜并保存到文件库任务名文件夹
  // 返回提示词字符串数组（顺序与 AI 输出一致）
  const runBatchInferenceForTask = async (fc, taskName) => {
    const ruleIds = Array.isArray(fc.promptRuleFileIds) ? fc.promptRuleFileIds : []
    if (ruleIds.length === 0) throw new Error('未配置提示词规则文件')
    if (!fc.apiConfigId) throw new Error('未配置 API 配置')

    // 1. 加载提示词规则文件内容
    const ruleFiles = await Promise.all(ruleIds.map(id => apiClient.getFileLibraryFileById(id)))
    const ruleContent = ruleFiles.filter(Boolean).map(f => f.content || '').filter(Boolean).join('\n\n---\n\n')
    if (!ruleContent) throw new Error('提示词规则文件为空')

    // 2. 加载 AI 配置
    const aiCfg = await apiClient.getAiConfigById(fc.apiConfigId)
    if (!aiCfg || !aiCfg.api_key || !aiCfg.model) throw new Error('API 配置不完整（缺少 api_key 或 model）')

    // 3. 构建 AI 请求
    const systemPrompt = `${ruleContent}

## 任务
请根据用户输入的要求，按照上述规则生成一组图片/视频提示词。

## 输出格式（必须严格遵守）
- 必须输出 JSON 数组，数组每个元素是 {"prompt": "提示词内容"}
- 不要输出任何 markdown 标题、解释性文字或额外说明
- 直接输出 JSON 数组本身，例如：
[{"prompt": "提示词1"}, {"prompt": "提示词2"}, {"prompt": "提示词3"}]

## 严格禁止
1. 禁止输出 JSON 之外的任何内容
2. 禁止输出 markdown 代码块标记（不要输出 \`\`\`json）
3. 禁止输出解释、说明、标题
4. 必须是合法的 JSON 数组`

    const userMessage = (fc.promptText || '').trim()
    if (!userMessage) throw new Error('未输入提示词要求')

    const aiApiBase = getAiApiBaseUrlForConfigInline(aiCfg)
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiCfg.api_key}` }
    if (aiCfg.provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin
      headers['X-Title'] = 'Batch Inference'
    }
    const requestBody = {
      model: aiCfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      stream: false,
      max_tokens: aiCfg.max_tokens || 4000,
      temperature: aiCfg.temperature ?? 0.8,
      top_p: aiCfg.top_p ?? 1.0,
      frequency_penalty: aiCfg.frequency_penalty ?? 0,
      presence_penalty: aiCfg.presence_penalty ?? 0
    }
    // 思考功能：读取 API 配置中的 enable_thinking 设置（默认关闭）
    requestBody.enable_thinking = !!aiCfg.enable_thinking

    generationStatus.value = `任务"${taskName}"：正在调用 AI 推理批量提示词...`
    const response = await fetch(`${aiApiBase}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`AI 接口错误 (${response.status}): ${errorText}`)
    }
    const data = await response.json()
    const aiText = data?.choices?.[0]?.message?.content || ''
    if (!aiText) throw new Error('AI 未返回任何内容')

    // 4. 解析 AI 输出为提示词数组
    const prompts = parseBatchPromptsFromAIResponseInline(aiText)
    if (prompts.length === 0) throw new Error('AI 输出无法解析为批量提示词')

    // 5. 转换为 JSON 分镜格式（数组格式，与文件库"+JSON分镜"页面一致）并保存到文件库总库下任务名文件夹
    const storyboardArray = prompts.map((p, i) => ({ id: String(i + 1), prompt: p }))
    const jsonContent = JSON.stringify(storyboardArray, null, 2)
    const safeName = (taskName || 'batch-inference').replace(/[\\/:*?"<>|]/g, '_')
    const jsonFileName = `${safeName}_分镜_${Date.now()}.json`
    try {
      // 查找"总库"系统分类（is_system = 1），与图片保存位置保持一致
      // 注意：getFileLibraryCategories 后端会在缺失时自动创建"总库"系统分类
      const categories = await apiClient.getFileLibraryCategories()
      const rootCat = (categories || []).find(c => c && c.is_system === 1)
      if (!rootCat) throw new Error('未找到"总库"系统分类')
      const rootCategoryId = rootCat.id
      // 在总库下查找/创建以任务名命名的顶级文件夹（parent_id 为 null/0）
      const allFolders = await apiClient.getFileLibraryFolders({ parent_id: 'all' })
      let targetFolder = (allFolders || []).find(
        f => f.name === safeName && (!f.parent_id || f.parent_id === 0) && f.category_id === rootCategoryId
      )
      if (!targetFolder) {
        targetFolder = await apiClient.createFileLibraryFolder({
          name: safeName,
          parent_id: 0,
          category_id: rootCategoryId,
          is_callable: 0
        })
      }
      await apiClient.createFileLibraryFile({
        name: jsonFileName,
        file_type: 'json',
        content: jsonContent,
        folder_id: targetFolder.id,
        category_id: rootCategoryId,
        file_size: jsonContent.length
      })
    } catch (e) {
      console.warn('保存 AI 生成的 JSON 分镜文件失败:', e)
    }

    return prompts
  }

  // 内联辅助：根据 AI 配置获取 API 基地址
  function getAiApiBaseUrlForConfigInline(cfg) {
    if (!cfg) return ''
    const provider = cfg.provider
    if (provider === 'openrouter') return '/ai-api'
    if (provider === 'siliconflow') return '/siliconflow-api'
    if (provider === 'openai') return '/openai-api'
    if (provider === 'aliyun') return '/aliyun-api'
    if (provider === 'google') return '/google-api'
    if (provider === 'lmstudio') return '/lmstudio-api'
    if (provider === 'modelscope') return '/modelscope-api'
    const url = cfg.api_url || ''
    return url.endsWith('/') ? url.slice(0, -1) : url
  }

  // 内联辅助：从 AI 文本响应中提取批量提示词（兼容 JSON 数组、JSON 代码块、分隔符文本）
  function parseBatchPromptsFromAIResponseInline(text) {
    if (!text || typeof text !== 'string') return []
    let s = text.trim()
    const codeBlockMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (codeBlockMatch) s = codeBlockMatch[1].trim()
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) {
        return parsed
          .map(item => {
            if (typeof item === 'string') return item
            if (item && typeof item === 'object') return item.prompt || item.content || item.text || ''
            return ''
          })
          .filter(p => p && p.trim())
      }
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.storyboards)) {
          return parsed.storyboards.map(sb => (sb && (sb.prompt || sb.content || '')) || '').filter(p => p.trim())
        }
        if (parsed.prompt) return [parsed.prompt]
      }
    } catch (e) { /* 不是 JSON，继续尝试分隔符方式 */ }
    const cleaned = s.replace(/^#+\s*.*/gm, '').trim()
    let parts = cleaned.split(/\n\s*---+\s*\n|\n\s*===+\s*\n/).map(p => p.trim()).filter(Boolean)
    if (parts.length >= 2) return parts
    const numbered = cleaned.match(/(?:^|\n)\s*\d+[\.\)、]\s*([^\n]+)/g)
    if (numbered && numbered.length >= 2) {
      return numbered.map(m => m.replace(/^[^\d]*\d+[\.\)、]\s*/, '').trim()).filter(Boolean)
    }
    parts = cleaned.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
    return parts.length >= 1 ? parts : (cleaned ? [cleaned] : [])
  }

  // 从JSON数据中提取提示词
  const extractPromptsFromJson = (jsonData) => {
    let parsed = jsonData
    if (typeof jsonData === 'string') {
      try { parsed = JSON.parse(jsonData) } catch (e) { return [] }
    }
    const prompts = []
    if (Array.isArray(parsed)) {
      parsed.forEach(item => {
        if (item && typeof item === 'object') {
          // 兼容 prompt 字段（旧格式）和 content 字段（新格式：批量提示词、分镜）
          if (item.prompt) prompts.push(item.prompt)
          else if (item.content) prompts.push(item.content)
        } else if (typeof item === 'string') {
          prompts.push(item)
        }
      })
    } else if (parsed && typeof parsed === 'object') {
      if (parsed.prompt) {
        prompts.push(parsed.prompt)
      } else if (parsed.content) {
        prompts.push(parsed.content)
      } else if (Array.isArray(parsed.storyboards)) {
        parsed.storyboards.forEach(sb => {
          if (sb && sb.prompt) prompts.push(sb.prompt)
          else if (sb && sb.content) prompts.push(sb.content)
        })
      }
    }
    return prompts
  }

  // 批量执行多个任务（依次执行，支持暂停/恢复/断点续传）
  // 加载单个任务详情，构建可执行的 task 对象（与 executeTasks 内联逻辑保持一致）
  const loadTaskDetail = async (taskId) => {
    const task = await apiClient.getGenerationTaskById(taskId)
    if (!task) return null

    // 解析JSON文件ID列表
    let jsonIds = task.storyboard_json_ids
    if (typeof jsonIds === 'string') {
      try { jsonIds = JSON.parse(jsonIds) } catch (e) { jsonIds = [] }
    }

    // 解析插入的提示词ID，提前解析为内容前缀（从文件库获取内容）
    let insertedPromptIds = task.inserted_prompt_ids
    if (typeof insertedPromptIds === 'string') {
      try { insertedPromptIds = JSON.parse(insertedPromptIds) } catch (e) { insertedPromptIds = [] }
    }
    let promptPrefix = ''
    if (Array.isArray(insertedPromptIds) && insertedPromptIds.length > 0) {
      try {
        const promptFiles = await Promise.all(
          insertedPromptIds.map(id => apiClient.getFileLibraryFileById(id))
        )
        promptPrefix = promptFiles
          .filter(Boolean)
          .map(f => f.content)
          .filter(Boolean)
          .join('\n\n')
      } catch (e) {
        console.warn('加载插入提示词失败:', e)
      }
    }

    // 加载每个JSON文件并提取提示词（从文件库获取）
    const allPrompts = []
    for (const jsonId of jsonIds) {
      try {
        const jsonFile = await apiClient.getFileLibraryFileById(jsonId)
        if (jsonFile && jsonFile.content) {
          const prompts = extractPromptsFromJson(jsonFile.content)
          prompts.forEach(p => allPrompts.push({ prompt: p, source: jsonFile.name }))
        }
      } catch (e) {
        console.warn(`加载JSON文件 ${jsonId} 失败:`, e)
      }
    }

    // 加载功能任务单元配置（function_configs），每个功能作为一个独立的提示词条目
    let funcConfigs = task.function_configs
    if (typeof funcConfigs === 'string') {
      try { funcConfigs = JSON.parse(funcConfigs) } catch (e) { funcConfigs = [] }
    }
    if (Array.isArray(funcConfigs)) {
      for (const fc of funcConfigs) {
        // 批量推理 function config：调用 AI 推理批量提示词 → 转换 JSON 分镜 → 多个提示词条目
        if (fc.tabId === 'batch-inference') {
          try {
            const inferencePrompts = await runBatchInferenceForTask(fc, task.name)
            for (let i = 0; i < inferencePrompts.length; i++) {
              allPrompts.push({
                prompt: inferencePrompts[i],
                source: `${fc.functionName || '批量推理'} #${i + 1}`,
                functionConfig: {
                  workflowApiId: fc.selectedWorkflowId || 0,
                  comfyuiConfigId: fc.comfyuiConfigId || null,
                  videoParams: null,
                  imageParams: null,
                  inputImageGalleryIds: null,
                  tabId: 'batch-inference'
                }
              })
            }
          } catch (e) {
            console.error('批量推理 function 处理失败:', e)
            error.value = `批量推理失败: ${e.message || e}`
          }
          continue
        }
        const funcInsertedIds = Array.isArray(fc.insertedPromptIds) ? fc.insertedPromptIds : []
        let funcPrefix = ''
        if (funcInsertedIds.length > 0) {
          try {
            const files = await Promise.all(funcInsertedIds.map(id => apiClient.getFileLibraryFileById(id)))
            funcPrefix = files.filter(Boolean).map(f => f.content).filter(Boolean).join('\n\n')
          } catch (e) { /* ignore */ }
        }
        const funcPromptText = (funcPrefix ? funcPrefix + '\n' : '') + (fc.promptText || '')
        allPrompts.push({
          prompt: funcPromptText,
          source: fc.functionName || fc.tabName || '功能单元',
          functionConfig: {
            workflowApiId: fc.selectedWorkflowId || 0,
            comfyuiConfigId: fc.comfyuiConfigId || null,
            videoParams: fc.videoParams || null,
            imageParams: fc.imageParams || null,
            inputImageGalleryIds: Array.isArray(fc.inputImageGalleryIds) ? fc.inputImageGalleryIds : null,
            tabId: fc.tabId || null
          }
        })
      }
    }

    if (allPrompts.length === 0) return null

    const savedProgressIndex = Number(task.progress_index) || 0
    return {
      id: task.id,
      name: task.name,
      workflow_api_id: task.workflow_api_id || 0,
      // JSON 类任务的任务级 ComfyUI 配置（功能类任务在每个 functionConfig 中各自携带）
      comfyui_config_id: task.comfyui_config_id || 0,
      prompts: allPrompts,
      promptPrefix,
      total: allPrompts.length,
      completed: Math.min(savedProgressIndex, allPrompts.length),
      status: savedProgressIndex >= allPrompts.length ? 'completed' : 'pending',
      paused: false,
      progressIndex: savedProgressIndex
    }
  }

  // ==================== 任务调度器：按 ComfyUI 配置分"车道" ====================
  // 排队原则（2026-09-23 重构）：
  // - 同一个 ComfyUI 配置的任务严格串行（同一后台一次只跑一个，绝不互相打断/抢跑）
  // - 不同配置各自一条车道，可并行（相当于多线程，各调各的 ComfyUI 服务器）
  // - 全局只有一个调度入口：executeTasks/resumeExecution/addTaskToQueue/enqueueTasks
  //   全部汇聚到 enqueueTaskIds + pumpLane，任何路径都不可能起第二个执行循环
  // - 恢复(resume)只把任务标回"排队中(pending)"，由车道泵按顺序拉起——绝不直接标 running
  const laneBusy = ref({})

  const apiBaseFor = (url) => {
    if (!url) return ''
    const u = String(url)
    const low = u.toLowerCase()
    if (low.includes('127.0.0.1') || low.includes('localhost')) return '/api'
    return u.endsWith('/') ? u : u + '/'
  }

  // 任务所属车道：任务级 ComfyUI 配置 > 第一个分镜的功能配置 > 默认车道(0)
  const laneOf = (task) => {
    if (task && task.comfyui_config_id && task.comfyui_config_id > 0) return 'c' + task.comfyui_config_id
    const entry = (task && Array.isArray(task.prompts))
      ? task.prompts.find(p => p && p.functionConfig && p.functionConfig.comfyuiConfigId)
      : null
    if (entry) return 'c' + entry.functionConfig.comfyuiConfigId
    return 'c0'
  }

  const recomputeOverall = () => {
    taskExecution.value.overallTotal = taskExecution.value.tasks.reduce((s, t) => s + (Number(t.total) || 0), 0)
    taskExecution.value.overallCompleted = taskExecution.value.tasks.reduce((s, t) => s + (Number(t.completed) || 0), 0)
  }

  // 统一入队：装载任务详情进 taskExecution.tasks，然后泵起对应车道
  const enqueueTaskIds = async (taskIds) => {
    let accepted = false
    for (const taskId of taskIds) {
      if (taskExecution.value.tasks.some(t => t.id === taskId)) continue
      const detail = await loadTaskDetail(taskId)
      const placeholder = taskExecution.value.tasks.find(t => t.id === taskId)
      if (!detail) {
        if (placeholder) { placeholder.status = 'error'; placeholder.errorMessage = '任务无可执行内容' }
        error.value = '任务无可执行内容'
        continue
      }
      if (placeholder) {
        placeholder.status = 'pending'
        Object.assign(placeholder, detail)
        if (placeholder.status === 'loading') placeholder.status = 'pending'
      } else {
        taskExecution.value.tasks.push(detail)
      }
      recomputeOverall()
      accepted = true
      pumpLane(laneOf(detail))
    }
    return accepted
  }

  // 车道泵：同一车道同时只跑一个任务；前面的暂停/完成/删除后自动接棒
  const pumpLane = async (lane) => {
    if (laneBusy.value[lane]) return
    laneBusy.value[lane] = true
    isGenerating.value = true
    taskExecution.value.running = true
    error.value = ''
    try {
      while (isGenerating.value) {
        const next = taskExecution.value.tasks.find(t =>
          laneOf(t) === lane &&
          t.status === 'pending' && !t.paused &&
          (!t.total || (t.progressIndex || 0) < t.total)
        )
        if (!next) break
        next.status = 'running'
        taskExecution.value.currentTaskIndex = taskExecution.value.tasks.indexOf(next)
        await runTaskOnce(next)
      }
    } catch (err) {
      error.value = `任务执行失败: ${err.message}`
    } finally {
      laneBusy.value[lane] = false
      const othersBusy = Object.keys(laneBusy.value).some(k => laneBusy.value[k])
      if (!othersBusy) {
        isGenerating.value = false
        taskExecution.value.running = false
        taskExecution.value.currentTaskIndex = -1
        if (!error.value) generationStatus.value = '全部任务执行完成!'
      }
    }
  }

  // 将任务追加到当前执行队列（兼容旧调用）
  const addTaskToQueue = async (taskId) => {
    try {
      return await enqueueTaskIds([taskId])
    } catch (e) {
      console.error('加入队列失败:', e)
      error.value = `加入队列失败: ${e.message}`
      return false
    }
  }

  // 统一任务入队入口（兼容旧调用）：
  // - 有车道在跑 → 只追加到队尾，绝不重置执行状态
  // - 没有车道在跑 → 泵起执行
  const enqueueTasks = async (taskIds) => {
    if (!taskIds || !taskIds.length) return false
    return await enqueueTaskIds(taskIds)
  }

  const executeTasks = async (selectedTaskIds) => {
    if (!selectedTaskIds || selectedTaskIds.length === 0) {
      error.value = '请选择要执行的任务'
      return
    }
    // 已有车道在跑 → 不重置任何状态，只追加到队尾（防止旧调用方绕过队列）
    if (Object.values(laneBusy.value).some(Boolean)) {
      await enqueueTaskIds(selectedTaskIds)
      return
    }
    isGenerating.value = true
    error.value = ''
    results.value = []
    progress.value = 0
    generationStatus.value = '正在加载任务详情...'

    // 立即添加占位任务状态，使"执行中任务"页面一开始就显示"加载中"而非"排队"
    taskExecution.value = {
      running: true,
      tasks: selectedTaskIds.map(id => ({
        id,
        name: `任务 #${id}`,
        status: 'loading',
        total: 0,
        completed: 0,
        progressIndex: 0,
        prompts: [],
        paused: false,
        errorMessage: ''
      })),
      currentTaskIndex: -1,
      overallCompleted: 0,
      overallTotal: 0
    }

    await enqueueTaskIds(selectedTaskIds)
  }

  // 单个任务的完整生命周期（由车道泵驱动，同一时刻每条车道只进入一个任务）
  const runTaskOnce = async (task) => {
    const configStore = useConfigStore()

    // 该任务的 ComfyUI 配置解析——不改动全局配置，并行车道各用各的
    let comfyCfgs = null
    const getCfgs = async () => {
      if (!comfyCfgs) {
        try { comfyCfgs = (await apiClient.getActiveComfyuiConfigs()) || [] }
        catch (e) { comfyCfgs = [] }
      }
      return comfyCfgs
    }
    let taskCfg = null
    if (task.comfyui_config_id && task.comfyui_config_id > 0) {
      taskCfg = (await getCfgs()).find(c => c.id === task.comfyui_config_id) || null
    }

    // 加载任务级默认工作流
    let taskWorkflow = configStore.customWorkflow || defaultWorkflow
    if (task.workflow_api_id > 0) {
      try {
        const wfFile = await apiClient.getFileLibraryFileById(task.workflow_api_id)
        if (wfFile && wfFile.content) {
          taskWorkflow = typeof wfFile.content === 'string'
            ? JSON.parse(wfFile.content)
            : wfFile.content
        }
      } catch (e) {
        console.warn('加载任务工作流失败，使用默认:', e)
      }
    }

    // 从断点处开始执行
    const startIdx = task.progressIndex || 0
    for (let pi = startIdx; pi < task.prompts.length; pi++) {
      // 检查整体停止
      if (!isGenerating.value) break
      // 检查单任务暂停：跳到下一个任务（不阻塞）
      if (task.paused) {
        task.status = 'paused'
        generationStatus.value = `任务已暂停: ${task.name} (已完成 ${task.completed}/${task.total})，下一个任务自动接棒`
        break
      }

      // 拼接插入的提示词前缀 + 分镜提示词
      const entry = task.prompts[pi]
      const basePrompt = entry.prompt
      const prompt = task.promptPrefix ? task.promptPrefix + '\n' + basePrompt : basePrompt
      generationStatus.value = `${task.name} - 第 ${pi + 1}/${task.total} 个分镜`

      // 本分镜的目标 ComfyUI（功能配置 > 任务配置 > 全局当前配置），不改全局
      let workflowToUse = taskWorkflow
      let promptUrl = ''
      let promptPrefixName = ''
      const fc = entry.functionConfig
      if (fc && fc.comfyuiConfigId) {
        const cfg = (await getCfgs()).find(c => c.id === fc.comfyuiConfigId)
        if (cfg && cfg.comfyui_url) {
          promptUrl = cfg.comfyui_url
          promptPrefixName = cfg.filename_prefix || ''
        }
      } else if (taskCfg) {
        promptUrl = taskCfg.comfyui_url || ''
        promptPrefixName = taskCfg.filename_prefix || ''
      }

      // 功能自带的工作流
      if (fc && fc.workflowApiId && fc.workflowApiId > 0) {
        try {
          const wfFile = await apiClient.getFileLibraryFileById(fc.workflowApiId)
          if (wfFile && wfFile.content) {
            workflowToUse = typeof wfFile.content === 'string'
              ? JSON.parse(wfFile.content)
              : wfFile.content
          }
        } catch (e) {
          console.warn('加载功能工作流失败，使用任务工作流:', e)
        }
      }

      try {
        // 注入功能配置的视频/图片参数到工作流
        let workflowForPrompt = workflowToUse
        if (fc && (fc.videoParams || fc.imageParams)) {
          workflowForPrompt = JSON.parse(JSON.stringify(workflowToUse))
          const setNodeInput = (nodeId, inputName, value) => {
            if (!nodeId) return false
            const id = String(nodeId)
            const node = workflowForPrompt[id]
            if (node && node.inputs) {
              if (inputName in node.inputs) { node.inputs[inputName] = value; return true }
            }
            return false
          }
          if (fc.videoParams) {
            const vp = fc.videoParams
            if (vp.widthNodeId) setNodeInput(vp.widthNodeId, 'width', Number(vp.width) || 512)
            if (vp.heightNodeId) setNodeInput(vp.heightNodeId, 'height', Number(vp.height) || 512)
            if (vp.lengthNodeId) setNodeInput(vp.lengthNodeId, 'length', Number(vp.length) || 25)
            if (vp.fpsNodeId) setNodeInput(vp.fpsNodeId, 'fps', Number(vp.fps) || 8)
            if (vp.t2vNodeId) setNodeInput(vp.t2vNodeId, 'text_to_video', vp.textToVideo ? true : false)
          }
          if (fc.imageParams) {
            const ip = fc.imageParams
            if (ip.widthNodeId && ip.width != null && ip.width !== '') setNodeInput(ip.widthNodeId, 'width', Number(ip.width) || 512)
            if (ip.heightNodeId && ip.height != null && ip.height !== '') setNodeInput(ip.heightNodeId, 'height', Number(ip.height) || 512)
          }
        }

        // 加载功能任务单元的输入图片并应用到工作流（图生视频/图片编辑）
        if (fc && Array.isArray(fc.inputImageGalleryIds) && fc.inputImageGalleryIds.some(id => id)) {
          const isImgEdit = fc.tabId === 'img2img'
          const IMG_EDIT_NODE_IDS = ['63', '64', '61']
          const imgSlots = []
          for (let si = 0; si < fc.inputImageGalleryIds.length; si++) {
            const gid = fc.inputImageGalleryIds[si]
            if (!gid) continue
            try {
              const base64 = await apiClient.getGalleryImageBase64(gid)
              if (base64) imgSlots.push({ base64, nodeId: isImgEdit ? IMG_EDIT_NODE_IDS[si] : null })
            } catch (e) {
              console.warn(`[批量] 加载图库图片 ${gid} 失败:`, e)
            }
          }
          if (imgSlots.length > 0) {
            // 确保是可变副本（前面可能未复制）
            if (workflowForPrompt === workflowToUse) {
              workflowForPrompt = JSON.parse(JSON.stringify(workflowToUse))
            }
            await applyInputImagesToWorkflow(workflowForPrompt, imgSlots)
          }
        }

        const updatedWorkflow = updateWorkflow(workflowForPrompt, prompt, 1, null, promptPrefixName || undefined)
        const base = apiBaseFor(promptUrl) || undefined
        const promptId = await sendGenerateRequest(updatedWorkflow, base)
        await pollTaskStatus(promptId, base)
      } catch (promptErr) {
        // 单个分镜执行失败（如 ComfyUI 连接失败），标记任务错误并跳出该任务
        console.error(`任务 "${task.name}" 执行失败:`, promptErr)
        task.status = 'error'
        task.errorMessage = promptErr.message || '执行失败'
        try {
          await apiClient.updateGenerationTask(task.id, {
            error_message: task.errorMessage,
            execution_status: 'failed'
          })
        } catch (e) { /* ignore */ }
        generationStatus.value = `任务 "${task.name}" 执行失败: ${task.errorMessage}`
        break
      }

      task.completed = pi + 1
      task.progressIndex = pi + 1
      recomputeOverall()
      if (taskExecution.value.overallTotal > 0) {
        progress.value = Math.round((taskExecution.value.overallCompleted / taskExecution.value.overallTotal) * 100)
      }

      // 持久化进度到数据库（断点续传）
      try {
        await apiClient.updateGenerationTaskProgress(task.id, {
          progress_index: pi + 1,
          total_prompts: task.total
        })
      } catch (e) { /* ignore */ }

      // 保存到文件库（生成一张就出现一张）。失败会在状态栏明确提示，不再静默。
      if (results.value.length > 0) {
        const latestResult = results.value[results.value.length - 1]
        if (!latestResult.prompt) latestResult.prompt = prompt
        // 压缩缩略图（避免存储原图 10M 大图）
        if (!latestResult.isVideo && !latestResult.thumbnail) {
          latestResult.thumbnail = await compressThumbnail(latestResult.url)
        }
        const ok = await persistTaskResultToLibrary(task, latestResult, promptUrl || configStore.config.comfyuiUrl)
        generationStatus.value = ok
          ? `任务 ${task.name} - 第 ${pi + 1}/${task.total} 张已保存`
          : `任务 ${task.name} - 第 ${pi + 1}/${task.total} 张生成成功，但写入总库失败（请检查下载服务 3006 / API 服务 3007 是否在运行）`
      }
    }

    // 任务收尾状态（error 状态优先，不被覆盖）
    if (task.status === 'error') {
      // 错误状态已设置
    } else if (task.paused) {
      task.status = 'paused'
      // 确保进度已保存到数据库
      try {
        await apiClient.updateGenerationTaskProgress(task.id, {
          progress_index: task.progressIndex,
          total_prompts: task.total
        })
      } catch (e) { /* ignore */ }
    } else if (task.progressIndex >= task.total && isGenerating.value) {
      task.status = 'completed'
      try {
        await apiClient.updateGenerationTaskProgress(task.id, { progress_index: 0 })
      } catch (e) { /* ignore */ }
      // 每张图已在生成时即时保存到用户目录，任务完成时仅显示完成信息
      generationStatus.value = `任务 ${task.name} 已完成，共 ${task.total} 张`
    } else if (!isGenerating.value) {
      task.status = 'cancelled'
    }
  }

  // 暂停单个任务（当前分镜跑完后跳到下一个任务，不阻塞车道）
  const pauseTask = async (taskId) => {
    const task = taskExecution.value.tasks.find(t => t.id === taskId)
    if (task && (task.status === 'running' || task.status === 'pending' || task.status === 'loading')) {
      task.paused = true
      if (task.status === 'pending' || task.status === 'loading') task.status = 'paused'
      generationStatus.value = `已暂停任务: ${task.name} (已完成 ${task.completed}/${task.total})`
      // 确保进度已保存到数据库
      try {
        await apiClient.updateGenerationTaskProgress(task.id, {
          progress_index: task.progressIndex,
          total_prompts: task.total
        })
      } catch (e) { /* ignore */ }
    }
  }

  // 恢复单个任务：只标回"排队中"，由车道泵按顺序拉起（绝不插队、绝不开第二个循环）
  const resumeTask = async (taskId) => {
    const task = taskExecution.value.tasks.find(t => t.id === taskId)
    if (!task) return false
    task.paused = false
    task.status = 'pending'
    if (task.progressIndex == null) task.progressIndex = task.completed || 0
    generationStatus.value = `已恢复任务: ${task.name}，排队等待执行`
    pumpLane(laneOf(task))
    return true
  }

  // 批量暂停任务
  const batchPauseTasks = async (taskIds) => {
    for (const id of taskIds) {
      await pauseTask(id)
    }
  }

  // 继续执行（兼容旧调用）：把所有可跑的任务重新交给各自车道泵
  const resumeExecution = async () => {
    const tasks = taskExecution.value.tasks
    for (const t of tasks) {
      if (t.status === 'pending' && !t.paused && (!t.total || (t.progressIndex || 0) < t.total)) {
        pumpLane(laneOf(t))
      }
    }
  }

  // 重新排序任务（拖拽后调用）
  const reorderTasks = (newTaskOrder) => {
    if (!Array.isArray(newTaskOrder)) return
    taskExecution.value.tasks = newTaskOrder
  }

  // 标记任务完成（从批量任务列表移除，并写入数据库 completed 状态）
  const completeTask = async (taskId) => {
    try {
      await apiClient.completeGenerationTask(taskId)
      const idx = taskExecution.value.tasks.findIndex(t => t.id === taskId)
      if (idx >= 0) taskExecution.value.tasks.splice(idx, 1)
      taskExecution.value.overallTotal = taskExecution.value.tasks.reduce((s, t) => s + t.total, 0)
      taskExecution.value.overallCompleted = taskExecution.value.tasks.reduce((s, t) => s + t.completed, 0)
      generationStatus.value = `任务 ${taskId} 已标记完成`
    } catch (e) {
      error.value = `标记完成失败: ${e.message}`
    }
  }

  // 加载已审核（approved）的任务，用于批量任务页面
  const loadApprovedTasks = async () => {
    const tasks = await apiClient.getGenerationTasks({ status: 'approved' })
    return tasks
  }

  const cancelTaskExecution = async () => {
    isGenerating.value = false
    progress.value = 0
    currentPromptId.value = ''
    generationStatus.value = '已停止'
    taskExecution.value.running = false
    if (taskExecution.value.currentTaskIndex >= 0) {
      const task = taskExecution.value.tasks[taskExecution.value.currentTaskIndex]
      if (task && task.status === 'running') {
        task.status = 'cancelled'
        task.paused = false
      }
    }
  }

  const downloadImage = async (result, index) => {
    try {
      const filename = result.filename || `image_${index + 1}.png`
      const response = await fetch(result.url)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      error.value = `下载失败: ${e.message}`
    }
  }

  const toggleImageShow = (index) => {
    results.value[index].loaded = !results.value[index].loaded
  }

  const toggleImageInfo = (index) => {
    results.value[index].showInfo = !results.value[index].showInfo
  }

  const copyPrompt = async (prompt, index) => {
    try {
      await navigator.clipboard.writeText(prompt || '无提示词')
      copyStatus.value[index] = '成功'
      setTimeout(() => {
        copyStatus.value[index] = ''
      }, 3000)
    } catch (e) {
      copyStatus.value[index] = '失败'
      setTimeout(() => {
        copyStatus.value[index] = ''
      }, 3000)
    }
  }

  const toggleAllImages = () => {
    allImagesVisible.value = !allImagesVisible.value
    results.value.forEach(result => {
      result.loaded = allImagesVisible.value
    })
  }

  const saveAllImagesToDirectory = async () => {
    if (results.value.length === 0) {
      generationStatus.value = '没有图片可保存'
      return
    }
    await saveImageToDirectory(results.value)
  }

  // ---------- 任务状态实时写回数据库 ----------
  // 之前只有"任务中心"组件打开时才同步 execution_status，导致刷新网页后
  // 队列面板 / 目录瓦片 / 任务中心全部丢失未完成任务。现在在 store 层统一写库：
  // 断电、误关页面后重新打开，任务仍在（恢复为"已暂停"，可从断点继续）。
  const statusSent = new Map() // taskId -> 上次写库签名，避免重复请求
  function dbStatusOf(t) {
    if (t.status === 'running' || t.status === 'loading') return 'executing'
    if (t.status === 'pending') return t.paused ? 'paused' : 'executing'
    if (t.status === 'paused') return 'paused'
    if (t.status === 'completed') return 'completed'
    if (t.status === 'error') return 'failed'
    return 'idle'
  }
  watch(taskExecution, (ex) => {
    const tasks = (ex && Array.isArray(ex.tasks)) ? ex.tasks : []
    for (const t of tasks) {
      if (!t || !t.id) continue
      const st = dbStatusOf(t)
      const done = Number(t.completed) || 0
      const pi = Number(t.progressIndex) || 0
      const err = t.errorMessage || ''
      const sig = `${st}|${done}|${pi}|${err}`
      if (statusSent.get(t.id) === sig) continue
      statusSent.set(t.id, sig)
      const payload = {
        execution_status: st,
        // 完成后进度归零（与既有逻辑一致，避免被当成"未跑完"）
        progress_index: st === 'completed' ? 0 : (pi || done),
        total_prompts: Number(t.total) || undefined,
      }
      if (err) payload.error_message = err
      apiClient.updateGenerationTask(t.id, payload).catch(() => statusSent.delete(t.id))
    }
  }, { deep: true })

  const cancelGeneration = async () => {
    isGenerating.value = false
    progress.value = 0
    currentPromptId.value = ''
    generationStatus.value = '已停止'
    // Save current batch job status if any
    if (currentBatchJobId.value) {
      try {
        await apiClient.updateBatchJob(currentBatchJobId.value, {
          status: 'cancelled',
          completed_count: completedCount.value,
          current_index: completedCount.value
        })
      } catch (e) { /* ignore */ }
      currentBatchJobId.value = null
    }
  }

  return {
    isGenerating,
    generationStatus,
    error,
    progress,
    currentPromptId,
    results,
    allImagesVisible,
    copyStatus,
    generationOptions,
    storyboardPrompts,
    parsedStoryboards,
    jsonSaveMessage,
    hasSelectedFile,
    cancelling,
    currentBatchJobId,
    batchQueue,
    batchCategory,
    batchWorkflowApiId,
    completedCount,
    selectedWorkflowApiId,
    pendingFunctionUnit,
    setPendingFunctionUnit,
    clearPendingFunctionUnit,
    rightPanelTab,
    setRightPanelTab,
    taskExecution,
    updateWorkflow,
    sendGenerateRequest,
    pollTaskStatus,
    resetProgress,
    saveImageToDirectory,
    compressThumbnail,
    generate,
    generateWithImage,
    batchGenerate,
    executeTasks,
    enqueueTasks,
    addTaskToQueue,
    pauseTask,
    resumeTask,
    batchPauseTasks,
    extractPromptsFromJson,
    resumeExecution,
    reorderTasks,
    completeTask,
    loadApprovedTasks,
    cancelTaskExecution,
    cancelGeneration,
    downloadImage,
    toggleImageShow,
    toggleImageInfo,
    copyPrompt,
    toggleAllImages,
    saveAllImagesToDirectory
  }
})
