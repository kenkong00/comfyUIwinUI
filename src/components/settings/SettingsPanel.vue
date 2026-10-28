<template>
  <div class="card settings-panel">
    <h2 v-if="!standalone">设置</h2>

    <div v-if="!standalone" class="tabs">
      <div
        class="tab-item"
        :class="{ active: activeTab === 'ai' }"
        @click="switchTab('ai')"
      >
        API配置
      </div>
      <div
        class="tab-item"
        :class="{ active: activeTab === 'comfyui' }"
        @click="switchTab('comfyui')"
      >
        ComfyUI 配置
      </div>
      <div
        class="tab-item"
        :class="{ active: activeTab === 'editor' }"
        @click="switchTab('editor')"
      >
        编辑设置
      </div>
      <div
        class="tab-item"
        :class="{ active: activeTab === 'plugins' }"
        @click="switchTab('plugins')"
      >
        插件
      </div>
    </div>

    <!-- ==================== API 配置（列表管理） ==================== -->
    <div v-show="activeTab === 'ai'" class="tab-content">
      <h3>API 配置管理</h3>

      <!-- 分类栏 -->
      <div class="category-bar">
        <div class="category-tabs">
          <div
            v-for="cat in allAiCategories"
            :key="cat.id"
            :class="['category-tab', { active: currentAiCategoryId === cat.id }]"
            @click="currentAiCategoryId = cat.id"
          >
            <span class="cat-name">{{ cat.name }}</span>
            <span class="cat-count">{{ getAiCategoryCount(cat.id) }}</span>
            <span
              v-if="!cat.is_system && cat.id !== 'all'"
              class="cat-actions"
              @click.stop
            >
              <button class="cat-action-btn" @click="openRenameCategory('ai', cat)" title="重命名">改</button>
              <button class="cat-action-btn danger" @click="confirmDelete('ai-category', cat)" title="删除">删</button>
            </span>
          </div>
        </div>
        <button class="btn btn-sm" @click="openAddCategory('ai')">+ 添加分类</button>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn btn-sm" @click="toggleAiSelectAll">
            {{ allAiSelected ? '取消全选' : '全选' }}
          </button>
          <button class="btn btn-sm btn-primary" @click="openNewAi">+ 新建配置</button>
          <button
            v-if="aiSelectedIds.length > 0"
            class="btn btn-sm btn-danger"
            @click="confirmDelete('ai-batch')"
          >
            删除选中 ({{ aiSelectedIds.length }})
          </button>
          <button
            v-if="aiSelectedIds.length > 0"
            class="btn btn-sm"
            @click="openBatchMove('ai')"
          >
            移动选中
          </button>
          <button
            v-if="aiSelectedIds.length > 0"
            class="btn btn-sm"
            @click="batchTestAi"
            :disabled="aiBatchTesting"
          >
            {{ aiBatchTesting ? '测试中...' : '批量测试 (' + aiSelectedIds.length + ')' }}
          </button>
          <button
            v-if="aiSelectedIds.length > 0"
            class="btn btn-sm"
            @click="batchSetCallable(true)"
          >
            设为可调用 ({{ aiSelectedIds.length }})
          </button>
          <button
            v-if="aiSelectedIds.length > 0"
            class="btn btn-sm"
            @click="batchSetCallable(false)"
          >
            取消可调用
          </button>
        </div>
        <div class="toolbar-right">
          <input
            type="text"
            v-model="aiSearchQuery"
            placeholder="搜索名称/服务商/模型..."
            class="search-input"
          />
        </div>
      </div>

      <p class="ai-config-hint">
        <b>使用中</b>＝对话实际调用的配置（点行内「使用」切换，只能有一条）；<b>可调用</b>＝允许它出现在对话窗口的模型下拉里；<b>状态</b>只是点一下的连通性测试，不会改变对话用哪条配置。
      </p>

      <!-- 列表 -->
      <div class="config-list" v-if="filteredAiConfigs.length > 0">
        <div class="list-header ai-grid">
          <div class="col-check"></div>
          <div class="col-name">名称</div>
          <div class="col-provider">服务商</div>
          <div class="col-model">模型</div>
          <div class="col-status">状态</div>
          <div class="col-callable">可调用</div>
          <div class="col-cat">分类</div>
          <div class="col-actions">操作</div>
        </div>
        <div
          v-for="cfg in filteredAiConfigs"
          :key="cfg.id"
          :class="['list-row ai-grid', { selected: aiSelectedIds.includes(cfg.id) }]"
        >
          <div class="col-check" @click.stop="toggleAiSelect(cfg.id)">
            <div :class="['checkbox', { checked: aiSelectedIds.includes(cfg.id) }]"></div>
          </div>
          <div class="col-name" @click="openEditAi(cfg)" :title="cfg.name">
            <span class="name-text">{{ cfg.name }}</span>
            <span v-if="cfg.is_active" class="use-tag">使用中</span>
          </div>
          <div class="col-provider">{{ getProviderName(cfg.provider) }}</div>
          <div class="col-model" :title="cfg.model">{{ cfg.model || '-' }}</div>
          <div class="col-status">
            <button
              class="conn-btn"
              :class="aiConnTestStatus[cfg.id]?.state || 'idle'"
              @click.stop="testAiConfig(cfg)"
              :title="aiConnTestStatus[cfg.id]?.msg || '点击测试连通性'"
            >
              <span v-if="aiConnTestStatus[cfg.id]?.state === 'testing'">测试中</span>
              <span v-else-if="aiConnTestStatus[cfg.id]?.state === 'ok'">联通</span>
              <span v-else-if="aiConnTestStatus[cfg.id]?.state === 'fail'">未联通</span>
              <span v-else>测试</span>
            </button>
          </div>
          <div class="col-callable">
            <button
              class="callable-btn"
              :class="{ on: cfg.is_callable }"
              @click.stop="toggleSingleCallable(cfg)"
              :title="cfg.is_callable ? '已设为可调用（点击取消）' : '点击设为可调用'"
            >{{ cfg.is_callable ? '可调用' : '未启用' }}</button>
          </div>
          <div class="col-cat">{{ getAiCategoryName(cfg.category_id) }}</div>
          <div class="col-actions" @click.stop>
            <button class="btn-icon-sm" @click="openEditAi(cfg)" title="编辑">编辑</button>
            <button
              class="btn-icon-sm"
              :class="{ 'btn-activate-active': cfg.is_active }"
              @click="activateAiConfig(cfg.id)"
              :title="cfg.is_active ? '对话当前使用的配置' : '设为对话当前使用的配置'"
            >{{ cfg.is_active ? '使用中' : '使用' }}</button>
            <button class="btn-icon-sm danger" @click="confirmDelete('ai-config', cfg)" title="删除">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p>暂无API配置，请新建</p>
      </div>
    </div>

    <!-- ==================== ComfyUI 配置（列表管理） ==================== -->
    <div v-show="activeTab === 'comfyui'" class="tab-content">
      <h3>ComfyUI 配置管理</h3>

      <!-- 分类栏 -->
      <div class="category-bar">
        <div class="category-tabs">
          <div
            v-for="cat in allComfyuiCategories"
            :key="cat.id"
            :class="['category-tab', { active: currentComfyuiCategoryId === cat.id }]"
            @click="currentComfyuiCategoryId = cat.id"
          >
            <span class="cat-name">{{ cat.name }}</span>
            <span class="cat-count">{{ getComfyuiCategoryCount(cat.id) }}</span>
            <span
              v-if="!cat.is_system && cat.id !== 'all'"
              class="cat-actions"
              @click.stop
            >
              <button class="cat-action-btn" @click="openRenameCategory('comfyui', cat)" title="重命名">改</button>
              <button class="cat-action-btn danger" @click="confirmDelete('comfyui-category', cat)" title="删除">删</button>
            </span>
          </div>
        </div>
        <button class="btn btn-sm" @click="openAddCategory('comfyui')">+ 添加分类</button>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn btn-sm" @click="toggleComfyuiSelectAll">
            {{ allComfyuiSelected ? '取消全选' : '全选' }}
          </button>
          <button class="btn btn-sm btn-primary" @click="openNewComfyui">+ 新建配置</button>
          <button
            v-if="comfyuiSelectedIds.length > 0"
            class="btn btn-sm btn-danger"
            @click="confirmDelete('comfyui-batch')"
          >
            删除选中 ({{ comfyuiSelectedIds.length }})
          </button>
          <button
            v-if="comfyuiSelectedIds.length > 0"
            class="btn btn-sm"
            @click="openBatchMove('comfyui')"
          >
            移动选中
          </button>
          <button
            v-if="comfyuiSelectedIds.length > 0"
            class="btn btn-sm"
            @click="batchTestComfyui"
            :disabled="comfyuiBatchTesting"
          >
            {{ comfyuiBatchTesting ? '测试中...' : '批量测试 (' + comfyuiSelectedIds.length + ')' }}
          </button>
        </div>
        <div class="toolbar-right">
          <input
            type="text"
            v-model="comfyuiSearchQuery"
            placeholder="搜索名称/地址/目录..."
            class="search-input"
          />
        </div>
      </div>

      <!-- 列表 -->
      <div class="config-list" v-if="filteredComfyuiConfigs.length > 0">
        <div class="list-header comfyui-grid">
          <div class="col-check"></div>
          <div class="col-name">名称</div>
          <div class="col-url">ComfyUI地址</div>
          <div class="col-dir">下载目录</div>
          <div class="col-status">状态</div>
          <div class="col-cat">分类</div>
          <div class="col-actions">操作</div>
        </div>
        <div
          v-for="cfg in filteredComfyuiConfigs"
          :key="cfg.id"
          :class="['list-row comfyui-grid', { selected: comfyuiSelectedIds.includes(cfg.id) }]"
        >
          <div class="col-check" @click.stop="toggleComfyuiSelect(cfg.id)">
            <div :class="['checkbox', { checked: comfyuiSelectedIds.includes(cfg.id) }]"></div>
          </div>
          <div class="col-name" @click="openEditComfyui(cfg)" :title="cfg.name">{{ cfg.name }}</div>
          <div class="col-url" :title="cfg.comfyui_url">{{ cfg.comfyui_url || '-' }}</div>
          <div class="col-dir" :title="cfg.download_dir">{{ cfg.download_dir || '-' }}</div>
          <div class="col-status">
            <button
              class="conn-btn"
              :class="comfyuiConnTestStatus[cfg.id]?.state || 'idle'"
              @click.stop="testComfyuiConfig(cfg)"
              :title="comfyuiConnTestStatus[cfg.id]?.msg || '点击测试连通性'"
            >
              <span v-if="comfyuiConnTestStatus[cfg.id]?.state === 'testing'">测试中</span>
              <span v-else-if="comfyuiConnTestStatus[cfg.id]?.state === 'ok'">联通</span>
              <span v-else-if="comfyuiConnTestStatus[cfg.id]?.state === 'fail'">未联通</span>
              <span v-else>测试</span>
            </button>
          </div>
          <div class="col-cat">{{ getComfyuiCategoryName(cfg.category_id) }}</div>
          <div class="col-actions" @click.stop>
            <button class="btn-icon-sm" @click="openEditComfyui(cfg)" title="编辑">编辑</button>
            <button
              class="btn-icon-sm"
              :class="{ 'btn-activate-active': cfg.is_active }"
              @click="toggleComfyuiActive(cfg.id)"
              :title="cfg.is_active ? '取消激活' : '设为激活'"
            >{{ cfg.is_active ? '已激活' : '激活' }}</button>
            <button class="btn-icon-sm danger" @click="confirmDelete('comfyui-config', cfg)" title="删除">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p>暂无ComfyUI配置，请新建</p>
      </div>
    </div>

    <!-- ==================== 编辑设置（AI 文字编辑） ==================== -->
    <div v-show="activeTab === 'editor'" class="tab-content">
      <h3>编辑设置</h3>
      <p class="ai-config-hint">
        这里的键位只对「AI 文字编辑」生效：在任意可输入文字的地方按住设定的修饰键触发续写/扩写，
        或右键选择功能库里已激活的「文字编辑」功能。设置保存在账号下，换浏览器也一样。
      </p>

      <div class="editor-settings">
        <div class="es-row">
          <label class="es-label">启用 AI 文字编辑</label>
          <label class="switch-mini">
            <input type="checkbox" v-model="editorSettings.enabled" />
            <span class="switch-slider"></span>
            <span class="switch-label">{{ editorSettings.enabled ? '已启用' : '已关闭' }}</span>
          </label>
        </div>

        <div class="es-row">
          <label class="es-label">文本域右键显示菜单</label>
          <label class="switch-mini">
            <input type="checkbox" v-model="editorSettings.ctxMenuEnabled" />
            <span class="switch-slider"></span>
            <span class="switch-label">{{ editorSettings.ctxMenuEnabled ? '显示' : '不显示' }}</span>
          </label>
        </div>

        <div class="es-sep" />

        <div class="es-row">
          <label class="es-label">按住快捷键触发</label>
          <label class="switch-mini">
            <input type="checkbox" v-model="editorSettings.holdEnabled" />
            <span class="switch-slider"></span>
            <span class="switch-label">{{ editorSettings.holdEnabled ? '已启用' : '已关闭' }}</span>
          </label>
        </div>

        <div class="es-grid">
          <div class="es-field">
            <label>按键位置</label>
            <select v-model="editorSettings.holdSide">
              <option value="left">左边</option>
              <option value="right">右边</option>
              <option value="either">左右皆可</option>
            </select>
          </div>
          <div class="es-field">
            <label>修饰键</label>
            <select v-model="editorSettings.holdKey">
              <option value="ctrl">Ctrl</option>
              <option value="alt">Alt</option>
              <option value="shift">Shift</option>
            </select>
          </div>
          <div class="es-field">
            <label>按住时长（毫秒）</label>
            <input type="number" min="100" max="5000" step="100" v-model.number="editorSettings.holdMs" />
          </div>
        </div>

        <div class="es-sep" />

        <div class="es-grid">
          <div class="es-field">
            <label>采纳键（保留生成内容）</label>
            <select v-model="editorSettings.acceptKey">
              <option value="Tab">Tab</option>
              <option value="Enter">Enter</option>
              <option value="ArrowRight">→ 右方向键</option>
              <option value="F2">F2</option>
            </select>
          </div>
          <div class="es-field">
            <label>取消键（撤销生成内容）</label>
            <select v-model="editorSettings.cancelKey">
              <option value="Escape">Esc</option>
              <option value="Backspace">Backspace</option>
              <option value="Delete">Delete</option>
            </select>
          </div>
          <div class="es-field">
            <label>上下文长度（字）</label>
            <input type="number" min="0" max="5000" step="100" v-model.number="editorSettings.contextChars" />
          </div>
        </div>

        <div class="es-row">
          <label class="es-label">触发时先出灰色预览</label>
          <label class="switch-mini">
            <input type="checkbox" v-model="editorSettings.ghostEnabled" />
            <span class="switch-slider"></span>
            <span class="switch-label">{{ editorSettings.ghostEnabled ? '灰色预览（按采纳键保留）' : '直接弹结果窗' }}</span>
          </label>
        </div>

        <div class="es-field es-field-wide">
          <label>快捷键默认功能</label>
          <select v-model="editorSettings.defaultFunctionId">
            <option :value="null">（每次弹窗选择）</option>
            <option v-for="f in textEditStore.activeFunctions" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
          <small class="hint-text">
            已激活的「文字编辑」功能共 {{ textEditStore.activeFunctions.length }} 个；
            右键菜单始终列出全部已激活功能，这里只决定快捷键用哪一个。
          </small>
        </div>

        <div class="es-actions">
          <button class="btn btn-primary" :disabled="editorSaving" @click="saveEditorSettings">保存编辑设置</button>
          <button class="btn" @click="loadEditorSettings">重新载入</button>
          <span v-if="editorSavedMsg" class="es-msg" :class="{ 'es-msg-err': editorSavedErr }">{{ editorSavedMsg }}</span>
        </div>
      </div>
    </div>

    <!-- ==================== 插件管理 ==================== -->
    <div v-show="activeTab === 'plugins'" class="tab-content">
      <PluginManager />
    </div>

    <!-- ==================== 分镜生成配置 ==================== -->
    <div v-show="activeTab === 'parser'" class="tab-content">
      <!-- 文件编辑模式（双击 Json 分镜文件打开）只保留"批量提示词"，不显示子选项卡 -->
    <div v-if="!editingStoryboardFileId" class="parser-sub-tabs">
        <div
          class="parser-sub-tab"
          :class="{ active: parserSubTab === 'batch' }"
          @click="parserSubTab = 'batch'"
        >
          批量提示词
        </div>
        <div
          class="parser-sub-tab"
          :class="{ active: parserSubTab === 'test' }"
          @click="parserSubTab = 'test'"
        >
          测试解析
        </div>
        <div
          class="parser-sub-tab"
          :class="{ active: parserSubTab === 'rules' }"
          @click="parserSubTab = 'rules'"
        >
          TXT 分镜解析规则
        </div>
      </div>

      <!-- ===== 批量提示词子选项卡 ===== -->
      <div v-show="parserSubTab === 'batch'" class="parser-sub-content">
        <div class="parser-test-toolbar">
          <button type="button" class="btn btn-primary batch-add-btn" @click.prevent="addBatchPrompt" title="增加一个提示词">+</button>
          <input
            type="text"
            v-model="batchPromptsName"
            placeholder="输入名称（保存为 JSON 文件名）"
            class="parser-name-input"
          />
          <button
            type="button"
            class="btn"
            :disabled="!batchPromptsName.trim() || !batchPrompts.some(p => p.content.trim())"
            @click.prevent="onSaveBatchClick"
          >{{ editingStoryboardFileId ? '保存' : '保存' }}</button>
          <span v-if="editingStoryboardFileId && storyboardSaveState === 'saved'" class="storyboard-save-ok">已保存 ✓</span>
          <span v-else-if="editingStoryboardFileId && storyboardSaveState === 'error'" class="storyboard-save-err">保存失败</span>
        </div>

        <div v-for="(prompt, idx) in batchPrompts" :key="prompt.id" class="form-group batch-prompt-group">
          <label>提示词（{{ idx + 1 }}）</label>
          <div class="batch-prompt-wrapper">
            <textarea
              v-model="prompt.content"
              class="batch-content-editor"
              spellcheck="false"
              placeholder="粘贴提示词内容..."
              style="width: calc(100% - 38px); height: 120px; min-height: 0; box-shadow: none;"
            ></textarea>
            <button
              type="button"
              class="batch-prompt-delete"
              @click.prevent="removeBatchPrompt(prompt.id)"
              title="删除此提示词"
            >×</button>
          </div>
        </div>
      </div>

      <!-- ===== 测试解析子选项卡 ===== -->
      <div v-show="parserSubTab === 'test'" class="parser-sub-content">
        <div class="parser-test-toolbar">
          <button type="button" class="btn btn-primary" @click.prevent="testParser">测试解析</button>
          <input
            type="text"
            v-model="parserForm.saveName"
            placeholder="输入名称（保存为 JSON 文件名）"
            class="parser-name-input"
          />
          <button
            type="button"
            class="btn"
            :disabled="!parserTestResult || parserTestResult.length === 0 || !parserForm.saveName"
            @click.prevent="openSaveParserDialog"
          >保存</button>
        </div>

        <div class="form-group">
          <label for="testText">TXT 内容</label>
          <textarea
            id="testText"
            v-model="parserForm.testText"
            rows="10"
            placeholder="粘贴一段分镜 TXT 内容进行测试..."
          ></textarea>
        </div>

        <div v-if="parserTestResult" class="parser-test-result">
          <h4>识别结果</h4>
          <p class="result-summary">共识别到 <strong>{{ parserTestResult.length }}</strong> 个分镜</p>
          <div v-for="(sb, idx) in parserTestResult" :key="idx" class="parsed-storyboard">
            <div class="parsed-header">分镜 {{ sb.id }}</div>
            <div class="parsed-fields">
              <div><span class="field-label">视角：</span><span>{{ sb.视角 || '—' }}</span></div>
              <div><span class="field-label">角色动作与构图：</span><span>{{ sb.角色动作与构图 || '—' }}</span></div>
              <div><span class="field-label">灯光气氛：</span><span>{{ sb.灯光气氛 || '—' }}</span></div>
              <div><span class="field-label">场景环境：</span><span>{{ sb.场景环境 || '—' }}</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 规则配置子选项卡 ===== -->
      <div v-show="parserSubTab === 'rules'" class="parser-sub-content">
        <p class="parser-tip">
          当 AI 生成的分镜 TXT 格式不同导致解析失败时，可在此自定义识别规则。配置保存在浏览器本地，不影响其他设备。
        </p>

        <div class="form-group">
          <label for="startMarkers">分镜起始标记（每行一个，支持正则表达式）</label>
          <textarea
            id="startMarkers"
            v-model="parserForm.startMarkersText"
            rows="6"
            placeholder="例如：&#10;^--\\s*分镜\\s*\\d+&#10;^\\d+\\.\\s+视角[：:]"
          ></textarea>
          <small>每行一个正则。匹配行首表示新分镜开始。例如 <code>^--\\s*分镜\\s*\\d+</code> 匹配 "-- 分镜 1"；<code>^\\d+\\.\\s+视角[：:]</code> 匹配 "1. 视角：" 开头的紧凑单行格式</small>
        </div>

        <div class="form-group">
          <label for="fieldMappings">字段名映射（每行一个，格式：原字段名=&gt;目标字段名）</label>
          <textarea
            id="fieldMappings"
            v-model="parserForm.fieldMappingsText"
            rows="10"
            placeholder="例如：&#10;视角=>视角&#10;角色位置关系=>角色动作与构图&#10;打光=>灯光气氛"
          ></textarea>
          <small>目标字段名固定为 4 个：<code>视角</code>、<code>角色动作与构图</code>、<code>灯光气氛</code>、<code>场景环境</code>。原字段名是 TXT 中的实际标签，如 "角色位置关系" / "动作" / "打光" / "场景" 等</small>
        </div>

        <div class="form-group">
          <label for="fieldSeparators">单行分隔符（紧凑格式中字段之间用到的字符，空格分隔）</label>
          <input
            id="fieldSeparators"
            type="text"
            v-model="parserForm.fieldSeparatorsText"
            placeholder="例如：; ；"
          />
          <small>紧凑单行格式如 "1. 视角：xxx;动作：xxx;场景：xxx"，用 <code>;</code> 或 <code>；</code> 拆分。多个分隔符用空格分开</small>
        </div>

        <div class="form-group">
          <label for="promptTemplate">提示词模板（生成 JSON 时的 prompt 字段内容）</label>
          <textarea
            id="promptTemplate"
            v-model="parserForm.promptTemplate"
            rows="6"
            placeholder="视角：{视角}&#10;角色动作与构图：{角色动作与构图}&#10;灯光气氛：{灯光气氛}&#10;场景环境：{场景环境}"
          ></textarea>
          <small>使用 <code>{视角}</code>、<code>{角色动作与构图}</code>、<code>{灯光气氛}</code>、<code>{场景环境}</code> 作为占位符，会替换为实际内容</small>
        </div>

        <div class="parser-actions">
          <button type="button" class="btn btn-primary" @click.prevent="saveParserConfig">保存配置</button>
          <button type="button" class="btn" @click.prevent="resetParserConfig">恢复默认</button>
        </div>
      </div>
    </div>

    <!-- ============ 分镜解析保存对话框 ============ -->
    <FloatingWindow v-model:open="parserSaveModalOpen" title="保存到文件库" size="default">
      <p class="parser-save-tip">将解析结果保存为 JSON 文件到：</p>
      <div class="form-group">
        <label>分类</label>
        <select v-model="parserSaveModal.categoryId" @change="onParserSaveCategoryChange">
          <option :value="0">未分类</option>
          <option
            v-for="cat in fileLibraryStore.categories"
            :key="cat.id"
            :value="cat.id"
          >{{ cat.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>文件夹</label>
        <select v-model="parserSaveModal.folderId">
          <option :value="0">根目录</option>
          <option
            v-for="folder in parserSaveFolders"
            :key="folder.id"
            :value="folder.id"
          >{{ folder.name }}</option>
        </select>
      </div>
      <div v-if="parserSaveMessage" class="edit-message" :class="{ error: parserSaveError }">{{ parserSaveMessage }}</div>
      <template #footer>
        <button class="btn" @click="parserSaveModal.show = false">取消</button>
        <button class="btn btn-primary" @click="doSaveParserResult">确定</button>
      </template>
    </FloatingWindow>

    <!-- ============ 批量提示词保存对话框 ============ -->
    <FloatingWindow v-model:open="batchPromptsSaveModalOpen" title="保存到文件库" size="default">
      <p class="parser-save-tip">将批量提示词保存为 JSON 文件到：</p>
      <div class="form-group">
        <label>分类</label>
        <select v-model="batchPromptsSaveModal.categoryId" @change="onBatchPromptsSaveCategoryChange">
          <option :value="0">未分类</option>
          <option
            v-for="cat in fileLibraryStore.categories"
            :key="cat.id"
            :value="cat.id"
          >{{ cat.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>文件夹</label>
        <select v-model="batchPromptsSaveModal.folderId">
          <option :value="0">根目录</option>
          <option
            v-for="folder in batchPromptsSaveFolders"
            :key="folder.id"
            :value="folder.id"
          >{{ folder.name }}</option>
        </select>
      </div>
      <div v-if="batchPromptsSaveMessage" class="edit-message" :class="{ error: batchPromptsSaveError }">{{ batchPromptsSaveMessage }}</div>
      <template #footer>
        <button class="btn" @click="batchPromptsSaveModal.show = false">取消</button>
        <button class="btn btn-primary" @click="doSaveBatchPromptsResult">确定</button>
      </template>
    </FloatingWindow>

    <!-- ============ 添加/重命名分类对话框 ============ -->
    <FloatingWindow v-model:open="catModalOpen" :title="catModal.mode === 'add' ? '添加分类' : '重命名分类'" size="default">
      <div class="form-group">
        <label>分类名称</label>
        <input
          type="text"
          v-model="catModal.name"
          placeholder="输入分类名称"
          @keyup.enter="doCategoryModalSave"
        />
      </div>
      <template #footer>
        <button class="btn" @click="catModal.show = false">取消</button>
        <button class="btn btn-primary" :disabled="!catModal.name" @click="doCategoryModalSave">
          {{ catModal.mode === 'add' ? '添加' : '确定' }}
        </button>
      </template>
    </FloatingWindow>

    <!-- ============ 批量移动分类对话框 ============ -->
    <FloatingWindow v-model:open="batchMoveModalOpen" title="批量移动分类" size="default">
      <p>将选中的 {{ batchMoveSelectedCount }} 个配置移动到：</p>
      <div class="form-group">
        <select v-model="batchMoveModal.targetCategoryId">
          <option :value="0">未分类</option>
          <option
            v-for="cat in batchMoveCategoryList"
            :key="cat.id"
            :value="cat.id"
          >{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="batchMoveModal.show = false">取消</button>
        <button class="btn btn-primary" @click="doBatchMove">确定</button>
      </template>
    </FloatingWindow>

    <!-- ============ API 配置编辑对话框 ============ -->
    <FloatingWindow v-model:open="aiEditingOpen" :title="aiEditForm.id ? '编辑API配置' : '新建API配置'" size="large">
      <div class="form-row-3">
        <div class="form-group">
          <label>名称</label>
          <input type="text" v-model="aiEditForm.name" placeholder="例如: 硅基-7B" />
        </div>
        <div class="form-group">
          <label>分类</label>
          <select v-model="aiEditForm.category_id">
            <option :value="0">未分类</option>
            <option
              v-for="cat in configStore.aiConfigCategories"
              :key="cat.id"
              :value="cat.id"
            >{{ cat.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>服务商</label>
          <select v-model="aiEditForm.provider" @change="onAiProviderChange">
            <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>API密钥</label>
          <input type="text" v-model="aiEditForm.api_key" placeholder="输入API密钥" />
        </div>
        <div class="form-group">
          <label>API地址</label>
          <input type="text" v-model="aiEditForm.api_url" placeholder="例如: https://api.openai.com/v1" />
        </div>
      </div>
      <div class="form-group">
        <label>模型名称</label>
        <input type="text" v-model="aiEditForm.model" placeholder="例如: gpt-4o 或 openai/gpt-4o" />
        <div class="model-quick-select" v-if="testedModelsForForm.length > 0">
          <small>已测试模型：</small>
          <div
            v-for="m in testedModelsForForm"
            :key="m.id"
            class="model-btn-wrapper"
          >
            <button
              type="button"
              class="model-btn"
              @click.prevent="selectModelWithProvider(m.id, m.provider)"
            >{{ m.name }}</button>
            <button
              type="button"
              class="model-remove-btn"
              @click.prevent="removeTestedModel(m.id)"
              title="移除此模型"
            >×</button>
          </div>
        </div>
      </div>

      <h4 class="model-params-title">模型参数</h4>
      <div class="model-params-section">
        <div class="form-row-2">
          <div class="form-group slider-group">
            <label>温度 (temperature): {{ aiEditForm.temperature }}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              v-model.number="aiEditForm.temperature"
              class="simple-slider"
            />
          </div>
          <div class="form-group slider-group">
            <label>Top-P 采样 (top_p): {{ aiEditForm.top_p }}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              v-model.number="aiEditForm.top_p"
              class="simple-slider"
            />
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group slider-group">
            <label>频率惩罚 (frequency_penalty): {{ aiEditForm.frequency_penalty }}</label>
            <input
              type="range"
              min="-2"
              max="2"
              step="0.1"
              v-model.number="aiEditForm.frequency_penalty"
              class="simple-slider"
            />
          </div>
          <div class="form-group slider-group">
            <label>存在惩罚 (presence_penalty): {{ aiEditForm.presence_penalty }}</label>
            <input
              type="range"
              min="-2"
              max="2"
              step="0.1"
              v-model.number="aiEditForm.presence_penalty"
              class="simple-slider"
            />
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>对话最大 Token 数 (max_tokens)</label>
            <input
              type="number"
              min="100"
              max="32000"
              step="100"
              v-model.number="aiEditForm.max_tokens"
            />
          </div>
          <div class="form-group">
            <label>生图提示词最大 Token 数 (image_max_tokens)</label>
            <input
              type="number"
              min="100"
              max="8000"
              step="100"
              v-model.number="aiEditForm.image_max_tokens"
            />
          </div>
        </div>
        <div class="form-group thinking-toggle-group">
          <label class="thinking-toggle-label">
            <input
              type="checkbox"
              v-model="aiEditForm.enable_thinking"
            />
            <span>启用思考功能 (enable_thinking)</span>
          </label>
          <small class="hint-text">开启后模型会进行深度思考（适用于 DeepSeek-R1、Qwen-QwQ 等思考模型）。默认关闭。</small>
        </div>
      </div>

      <div class="ai-test-row">
        <button type="button" class="btn btn-sm test-ai-btn" @click.prevent="testAiFormConnection">
          测试连接
        </button>
        <span class="test-ai-status" v-if="aiTestStatus">{{ aiTestStatus }}</span>
      </div>
      <div v-if="aiSaveMessage" class="edit-message" :class="{ error: aiSaveError }">{{ aiSaveMessage }}</div>
      <template #footer>
        <button class="btn" @click="closeAiEditor">取消</button>
        <button class="btn btn-primary" @click="saveAiConfig">保存</button>
      </template>
    </FloatingWindow>

    <!-- ============ ComfyUI 配置编辑对话框 ============ -->
    <FloatingWindow v-model:open="comfyuiEditingOpen" :title="comfyuiEditForm.id ? '编辑ComfyUI配置' : '新建ComfyUI配置'" size="large">
      <div class="form-group">
        <label>名称</label>
        <input type="text" v-model="comfyuiEditForm.name" placeholder="例如: 本地ComfyUI" />
      </div>
      <div class="form-group">
        <label>分类</label>
        <select v-model="comfyuiEditForm.category_id">
          <option :value="0">未分类</option>
          <option
            v-for="cat in configStore.comfyuiConfigCategories"
            :key="cat.id"
            :value="cat.id"
          >{{ cat.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>ComfyUI 地址端口号</label>
        <div class="input-with-button">
          <input
            type="text"
            v-model="comfyuiEditForm.comfyui_url"
            placeholder="例如: http://localhost:8188"
          />
          <button
            type="button"
            class="btn btn-sm test-comfyui-btn"
            @click.prevent="testComfyuiFormUrl"
          >测试</button>
        </div>
        <span class="test-inline-status" v-if="comfyuiTestStatus">{{ comfyuiTestStatus }}</span>
      </div>
      <div class="form-group">
        <label>图片下载保存目录</label>
        <input
          type="text"
          v-model="comfyuiEditForm.download_dir"
          placeholder="默认: 日期目录"
        />
        <small>仅填写目录名称，会创建在您账户的私有目录下（user_data/您的用户名/downloads/）</small>
      </div>
      <div class="form-group">
        <label>自动批量下载</label>
        <input type="checkbox" v-model="comfyuiEditForm.auto_download" />
        <span class="checkbox-label">生成完成后自动下载到指定目录</span>
      </div>
      <div class="form-group">
        <label>文件名前缀</label>
        <input
          type="text"
          v-model="comfyuiEditForm.filename_prefix"
          placeholder="可选，留空使用默认前缀 ComfyUI"
        />
      </div>
      <div v-if="comfyuiSaveMessage" class="edit-message" :class="{ error: comfyuiSaveError }">{{ comfyuiSaveMessage }}</div>
      <template #footer>
        <button class="btn" @click="closeComfyuiEditor">取消</button>
        <button class="btn btn-primary" @click="saveComfyuiConfig">保存</button>
      </template>
    </FloatingWindow>

    <!-- ============ 删除确认弹窗 ============ -->
    <FloatingWindow v-model:open="deleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">{{ deleteConfirm.message }}</p>
      <template #footer>
        <button class="btn" @click="deleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDelete">确定删除</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useFileLibraryStore } from '@/stores/fileLibrary'
import { useTextEditStore, DEFAULT_EDITOR_SETTINGS } from '@/stores/textEdit'
import apiClient from '@/services/api'
import { parseStoryboardWithConfig } from '@/utils/storyboardParser'
import FloatingWindow from '@/components/common/FloatingWindow.vue'
import PluginManager from '@/components/settings/PluginManager.vue'

const configStore = useConfigStore()
const fileLibraryStore = useFileLibraryStore()
const textEditStore = useTextEditStore()

const props = defineProps({
  initialTab: {
    type: String,
    default: ''
  },
  // 独立应用模式（如"分镜生成"窗口）：隐藏"设置"标题与顶部选项卡
  standalone: {
    type: Boolean,
    default: false
  },
  // 打开已有 Json 分镜文件时由 StoryboardApp 传入：
  fileId: { type: [Number, String], default: null },
  fileName: { type: String, default: '' },
  fileContent: { type: String, default: '' }
})

const emit = defineEmits(['navigate', 'saved'])

const activeTab = ref(props.initialTab || 'ai')

// 选项卡到左侧导航 ID 的映射
const tabToNavId = (tab) => {
  if (tab === 'ai') return 'settings'
  if (tab === 'comfyui') return 'comfyui'
  if (tab === 'parser') return 'storyboard-parser'
  if (tab === 'editor') return 'settings'
  return 'settings'
}

// 切换选项卡时同步左侧导航激活状态
function switchTab(tab) {
  if (activeTab.value === tab) return
  activeTab.value = tab
  emit('navigate', tabToNavId(tab))
}

// 监听 initialTab 变化，实现左侧导航子项点击跳转到对应选项卡
// MainContent 传入的 initialTab 值：'' (API配置)、'comfyui'、'parser' (分镜生成)
watch(() => props.initialTab, (newTab) => {
  const tabMap = {
    '': 'ai',
    'comfyui': 'comfyui',
    'parser': 'parser'
  }
  const targetTab = tabMap[newTab] !== undefined ? tabMap[newTab] : 'ai'
  if (activeTab.value !== targetTab) {
    activeTab.value = targetTab
  }
})

// ============ 编辑设置（AI 文字编辑键位偏好） ============
// 本地先改副本，点「保存编辑设置」才写库，避免改一半就影响正在用的键位。
const editorSettings = reactive({ ...DEFAULT_EDITOR_SETTINGS })
const editorSaving = ref(false)
const editorSavedMsg = ref('')
const editorSavedErr = ref(false)
let editorMsgTimer = null

async function loadEditorSettings() {
  await textEditStore.loadSettings()
  Object.assign(editorSettings, DEFAULT_EDITOR_SETTINGS, textEditStore.settings)
  await textEditStore.loadFunctions()
}

async function saveEditorSettings() {
  editorSaving.value = true
  editorSavedMsg.value = ''
  editorSavedErr.value = false
  const patch = { ...editorSettings }
  if (patch.defaultFunctionId === '') patch.defaultFunctionId = null
  const ok = await textEditStore.saveSettings(patch)
  editorSaving.value = false
  editorSavedMsg.value = ok ? '✓ 已保存' : '保存失败：' + (textEditStore.lastError || '未知错误')
  editorSavedErr.value = !ok
  if (editorMsgTimer) clearTimeout(editorMsgTimer)
  editorMsgTimer = setTimeout(() => { editorSavedMsg.value = '' }, 3000)
}

// ============ 对话配置 ============
const workflowList = ref([])

const loadWorkflowList = async () => {
  try {
    const list = await apiClient.getCallableFiles('workflow')
    workflowList.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.warn('[Settings] 加载工作流列表失败:', e)
    workflowList.value = []
  }
}

// ============ 分镜解析配置 ============
// 分镜工具默认停在"批量提示词"（用户主工作区）；测试解析/规则按需切换
const parserSubTab = ref('batch')
const parserForm = reactive({
  startMarkersText: '',
  fieldMappingsText: '',
  fieldSeparatorsText: '',
  promptTemplate: '',
  testText: '',
  saveName: ''
})
const parserTestResult = ref(null)

// 分镜解析保存对话框
const parserSaveModal = reactive({
  show: false,
  categoryId: 0,
  folderId: 0
})
const parserSaveModalOpen = computed({
  get: () => parserSaveModal.show,
  set: (v) => { if (!v) parserSaveModal.show = false }
})
const parserSaveFolders = ref([])
const parserSaveMessage = ref('')
const parserSaveError = ref(false)

async function onParserSaveCategoryChange() {
  parserSaveModal.folderId = 0
  await loadParserSaveFolders()
}

async function loadParserSaveFolders() {
  parserSaveFolders.value = []
  if (!parserSaveModal.categoryId) return
  try {
    const fs = await apiClient.getFileLibraryFolders({ category_id: parserSaveModal.categoryId, parent_id: 0 })
    parserSaveFolders.value = Array.isArray(fs) ? fs : []
  } catch (e) {
    console.warn('加载文件夹失败:', e)
  }
}

function openSaveParserDialog() {
  if (!parserTestResult.value || parserTestResult.value.length === 0) return
  if (!parserForm.saveName || !parserForm.saveName.trim()) return
  parserSaveModal.categoryId = 0
  parserSaveModal.folderId = 0
  parserSaveMessage.value = ''
  parserSaveError.value = false
  // 确保分类已加载
  if (!fileLibraryStore.categories || fileLibraryStore.categories.length === 0) {
    fileLibraryStore.loadCategories().catch(() => {})
  }
  parserSaveModal.show = true
}

async function doSaveParserResult() {
  if (!parserTestResult.value || parserTestResult.value.length === 0) {
    parserSaveMessage.value = '没有可保存的解析结果'
    parserSaveError.value = true
    return
  }
  if (!parserForm.saveName || !parserForm.saveName.trim()) {
    parserSaveMessage.value = '请输入名称'
    parserSaveError.value = true
    return
  }
  try {
    const content = JSON.stringify(parserTestResult.value, null, 2)
    const filename = (parserForm.saveName.trim().replace(/\s+/g, '_')) + '.json'
    await fileLibraryStore.createFile({
      category_id: parserSaveModal.categoryId || 0,
      folder_id: parserSaveModal.folderId || 0,
      name: parserForm.saveName.trim(),
      file_type: 'json',
      filename: filename,
      content: content,
      prompt_count: parserTestResult.value.length,
      is_valid: 1
    })
    parserSaveMessage.value = '保存成功 ✓'
    parserSaveError.value = false
    setTimeout(() => {
      parserSaveModal.show = false
      parserSaveMessage.value = ''
    }, 1200)
  } catch (e) {
    parserSaveMessage.value = '保存失败: ' + (e.message || '未知错误')
    parserSaveError.value = true
  }
}

// 从 configStore 同步到表单（textarea 文本形式）
function syncParserFormFromStore() {
  const sp = configStore.storyboardParser
  parserForm.startMarkersText = (sp.startMarkers || []).join('\n')
  parserForm.fieldMappingsText = (sp.fieldMappings || []).join('\n')
  parserForm.fieldSeparatorsText = (sp.fieldSeparators || []).join(' ')
  parserForm.promptTemplate = sp.promptTemplate || ''
}

function parseParserFormToConfig() {
  return {
    startMarkers: parserForm.startMarkersText
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean),
    fieldMappings: parserForm.fieldMappingsText
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean),
    fieldSeparators: parserForm.fieldSeparatorsText
      .split(/\s+/)
      .map(s => s.trim())
      .filter(Boolean),
    promptTemplate: parserForm.promptTemplate || ''
  }
}

function saveParserConfig() {
  const cfg = parseParserFormToConfig()
  configStore.storyboardParser.startMarkers = cfg.startMarkers
  configStore.storyboardParser.fieldMappings = cfg.fieldMappings
  configStore.storyboardParser.fieldSeparators = cfg.fieldSeparators
  configStore.storyboardParser.promptTemplate = cfg.promptTemplate
  const ok = configStore.saveStoryboardParser()
  // 视觉反馈
  const btn = document.querySelector('.parser-actions .btn-primary')
  if (btn) {
    const original = btn.textContent
    btn.textContent = ok ? '已保存 ✓' : '保存失败 ✗'
    btn.style.backgroundColor = ok ? '#4CAF50' : '#e74c3c'
    btn.style.color = '#fff'
    setTimeout(() => {
      btn.textContent = original
      btn.style.backgroundColor = ''
      btn.style.color = ''
    }, 2000)
  }
}

function resetParserConfig() {
  if (!confirm('恢复为默认配置？当前自定义会丢失。')) return
  configStore.resetStoryboardParser()
  syncParserFormFromStore()
}

function testParser() {
  if (!parserForm.testText || !parserForm.testText.trim()) {
    parserTestResult.value = null
    return
  }
  // 临时使用表单当前内容（不强制先保存）
  const cfg = parseParserFormToConfig()
  try {
    parserTestResult.value = parseStoryboardWithConfig(parserForm.testText, cfg)
  } catch (e) {
    console.error('测试解析失败:', e)
    parserTestResult.value = []
  }
}

// 初始化表单
syncParserFormFromStore()

// ============ 批量提示词配置 ============
const batchPrompts = ref([{ id: 1, content: '' }])
const batchPromptsName = ref('')
const batchPromptsNextId = ref(2)

// 以"Json 分镜文件"模式打开（资源管理器双击 / 新建分镜文件）：
// 记录正在编辑的文件 id，编辑后点"保存"直接回写原文件（而不是另存对话框）。
const editingStoryboardFileId = ref(props.fileId != null ? Number(props.fileId) : null)
const storyboardSaveState = ref('') // '' | 'saved' | 'error'

// 启动时载入传入的分镜文件内容（兼容 content/prompt/text/中文字段等历史格式）
if (props.fileContent) {
  try {
    let arr = JSON.parse(props.fileContent)
    if (arr && typeof arr === 'object' && !Array.isArray(arr) && Array.isArray(arr.storyboards)) arr = arr.storyboards
    if (Array.isArray(arr)) {
      if (arr.length > 0) {
        const pickText = (p) => {
          for (const k of ['content', 'prompt', 'text', '提示词']) {
            if (p && typeof p[k] === 'string' && p[k].trim()) return p[k]
          }
          if (p && typeof p === 'object') {
            const vals = Object.values(p).filter(v => typeof v === 'string' && v.trim())
            if (vals.length) return vals.join('\n')
          }
          return ''
        }
        batchPrompts.value = arr.map((p, i) => ({ id: (p && p.id) ?? i + 1, content: pickText(p) }))
      }
      batchPromptsName.value = (props.fileName || '').replace(/\.json$/i, '')
      batchPromptsNextId.value = Math.max(0, ...batchPrompts.value.map(p => p.id)) + 1
    }
  } catch (e) {
    console.warn('[Storyboard] 分镜文件内容解析失败:', e)
  }
}

// 批量提示词保存对话框
const batchPromptsSaveModal = reactive({
  show: false,
  categoryId: 0,
  folderId: 0
})
const batchPromptsSaveModalOpen = computed({
  get: () => batchPromptsSaveModal.show,
  set: (v) => { if (!v) batchPromptsSaveModal.show = false }
})
const batchPromptsSaveFolders = ref([])
const batchPromptsSaveMessage = ref('')
const batchPromptsSaveError = ref(false)

// 从数据库加载批量提示词（编辑已有 Json 分镜文件时跳过——
// 否则用户全局配置会在挂载后覆盖刚从文件载入的内容，表现为"内容闪一下就变空/变成别的"）
async function loadBatchPrompts() {
  if (editingStoryboardFileId.value) return
  if (!apiClient.isLoggedIn()) return
  try {
    const configs = await apiClient.getConfigs()
    const data = configs.batch_prompts
    if (data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data
      if (parsed && Array.isArray(parsed.prompts) && parsed.prompts.length > 0) {
        batchPrompts.value = parsed.prompts
        batchPromptsName.value = parsed.name || ''
        batchPromptsNextId.value = parsed.nextId || (Math.max(...parsed.prompts.map(p => p.id), 0) + 1)
      }
    }
  } catch (e) {
    console.warn('[Settings] 加载批量提示词失败:', e)
  }
}

// 保存批量提示词到数据库（防抖）
let batchPromptsSaveTimeout = null
function saveBatchPrompts() {
  if (!apiClient.isLoggedIn()) return
  if (batchPromptsSaveTimeout) clearTimeout(batchPromptsSaveTimeout)
  batchPromptsSaveTimeout = setTimeout(async () => {
    try {
      await apiClient.saveConfig('batch_prompts', {
        name: batchPromptsName.value,
        prompts: batchPrompts.value,
        nextId: batchPromptsNextId.value
      })
    } catch (e) {
      console.error('[Settings] 保存批量提示词失败:', e)
    }
  }, 400)
}

// 监听批量提示词变化，自动保存到数据库
// （文件编辑模式下不写全局配置：编辑的是文件本身，不该动工具的默认工作区）
watch([batchPrompts, batchPromptsName], () => {
  if (editingStoryboardFileId.value) return
  saveBatchPrompts()
}, { deep: true })

// 增加一个提示词（新框置顶，便于连续输入）
function addBatchPrompt() {
  batchPrompts.value.unshift({ id: batchPromptsNextId.value++, content: '' })
}

// 删除指定提示词
function removeBatchPrompt(id) {
  const idx = batchPrompts.value.findIndex(p => p.id === id)
  if (idx > -1) {
    batchPrompts.value.splice(idx, 1)
  }
  // 全部删除后回到初始状态（保留一个空提示词）
  if (batchPrompts.value.length === 0) {
    batchPrompts.value = [{ id: batchPromptsNextId.value++, content: '' }]
  }
}

// 清空按钮已移除（一键清掉全部内容太危险）；逐条删除用每个提示词右上角的 ×

// 保存按钮分派：编辑已有分镜文件 → 直接回写原文件；否则打开另存对话框
function onSaveBatchClick() {
  if (editingStoryboardFileId.value) saveStoryboardFileBack()
  else openSaveBatchPromptsDialog()
}

// 把当前批量提示词回写到正在编辑的 Json 分镜文件
async function saveStoryboardFileBack() {
  if (!editingStoryboardFileId.value) return
  const validPrompts = batchPrompts.value.filter(p => p.content.trim())
  try {
    const updates = {
      content: JSON.stringify(validPrompts.map((p, i) => ({ id: i + 1, content: p.content.trim() })), null, 2),
    }
    const name = batchPromptsName.value.trim()
    if (name) {
      updates.name = name
      updates.filename = name.replace(/\s+/g, '_') + '.json'
    }
    await apiClient.updateFileLibraryFile(editingStoryboardFileId.value, updates)
    storyboardSaveState.value = 'saved'
    setTimeout(() => { if (storyboardSaveState.value === 'saved') storyboardSaveState.value = '' }, 2500)
    // 通知：①资源管理器刷新列表（改名/改内容后立即可见）；②窗口标题同步为新文件名
    window.dispatchEvent(new CustomEvent('fl-files-changed'))
    emit('saved', { name: batchPromptsName.value.trim() })
  } catch (e) {
    console.error('[Storyboard] 回写分镜文件失败:', e)
    storyboardSaveState.value = 'error'
    setTimeout(() => { if (storyboardSaveState.value === 'error') storyboardSaveState.value = '' }, 4000)
  }
}

// 打开批量提示词保存对话框
function openSaveBatchPromptsDialog() {
  if (!batchPromptsName.value.trim()) return
  const hasContent = batchPrompts.value.some(p => p.content.trim())
  if (!hasContent) return
  batchPromptsSaveModal.categoryId = 0
  batchPromptsSaveModal.folderId = 0
  batchPromptsSaveMessage.value = ''
  batchPromptsSaveError.value = false
  if (!fileLibraryStore.categories || fileLibraryStore.categories.length === 0) {
    fileLibraryStore.loadCategories().catch(() => {})
  }
  batchPromptsSaveModal.show = true
}

async function onBatchPromptsSaveCategoryChange() {
  batchPromptsSaveModal.folderId = 0
  await loadBatchPromptsSaveFolders()
}

async function loadBatchPromptsSaveFolders() {
  batchPromptsSaveFolders.value = []
  if (!batchPromptsSaveModal.categoryId) return
  try {
    const fs = await apiClient.getFileLibraryFolders({ category_id: batchPromptsSaveModal.categoryId, parent_id: 0 })
    batchPromptsSaveFolders.value = Array.isArray(fs) ? fs : []
  } catch (e) {
    console.warn('加载文件夹失败:', e)
  }
}

// 执行保存批量提示词为 JSON 文件
async function doSaveBatchPromptsResult() {
  if (!batchPromptsName.value.trim()) {
    batchPromptsSaveMessage.value = '请输入名称'
    batchPromptsSaveError.value = true
    return
  }
  const validPrompts = batchPrompts.value.filter(p => p.content.trim())
  if (validPrompts.length === 0) {
    batchPromptsSaveMessage.value = '没有可保存的提示词内容'
    batchPromptsSaveError.value = true
    return
  }
  try {
    const content = JSON.stringify(
      validPrompts.map((p, i) => ({ id: i + 1, content: p.content.trim() })),
      null, 2
    )
    const filename = (batchPromptsName.value.trim().replace(/\s+/g, '_')) + '.json'
    await fileLibraryStore.createFile({
      category_id: batchPromptsSaveModal.categoryId || 0,
      folder_id: batchPromptsSaveModal.folderId || 0,
      name: batchPromptsName.value.trim(),
      file_type: 'json',
      filename: filename,
      content: content,
      prompt_count: validPrompts.length,
      is_valid: 1
    })
    batchPromptsSaveMessage.value = '保存成功 ✓'
    batchPromptsSaveError.value = false
    setTimeout(() => {
      batchPromptsSaveModal.show = false
      batchPromptsSaveMessage.value = ''
    }, 1200)
  } catch (e) {
    batchPromptsSaveMessage.value = '保存失败: ' + (e.message || '未知错误')
    batchPromptsSaveError.value = true
  }
}

// ============ 服务商与模型快选 ============
const providers = ref([
  { id: 'siliconflow', name: '硅基流动' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'aliyun', name: '阿里云百炼' },
  { id: 'google', name: 'Google' },
  { id: 'lmstudio', name: 'LM Studio' },
  { id: 'modelscope', name: '魔塔社区' },
  { id: 'custom', name: '自定义' }
])

const getProviderName = (id) => {
  const p = providers.value.find(p => p.id === id)
  return p ? p.name : (id || '-')
}

const getDefaultApiUrl = (provider) => {
  const map = {
    openai: 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    siliconflow: 'https://api.siliconflow.cn/v1',
    aliyun: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    lmstudio: 'http://127.0.0.1:1234/v1',
    modelscope: 'https://api-inference.modelscope.cn/v1'
  }
  return map[provider] || ''
}

const getModelDisplayName = (modelId) => {
  const nameMap = {
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'openai/gpt-4o': 'GPT-4o',
    'anthropic/claude-3.5-sonnet': 'Claude 3.5',
    'google/gemini-pro-1.5': 'Gemini Pro',
    'meta-llama/llama-3.1-70b-instruct': 'Llama 3.1',
    'Qwen/Qwen2.5-7B-Instruct': 'Qwen2.5-7B',
    'Qwen/Qwen2.5-72B-Instruct': 'Qwen2.5-72B',
    'deepseek-ai/DeepSeek-V2.5': 'DeepSeek-V2.5',
    'THUDM/glm-4-9b-chat': 'GLM-4-9B',
    'qwen-plus': 'Qwen-Plus',
    'qwen-max': 'Qwen-Max',
    'qwen-turbo': 'Qwen-Turbo',
    'qwen-long': 'Qwen-Long',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
    'gemini-2.0-flash': 'Gemini 2.0 Flash',
    'gemini-flash-latest': 'Gemini Flash Latest',
    'minimax-m2.5': 'Minimax M2.5',
    'qwen2.5-7b-instruct': 'Qwen2.5-7B',
    'qwen2.5-72b-instruct': 'Qwen2.5-72B'
  }
  return nameMap[modelId] || (modelId ? modelId.split('/').pop().split('-')[0] : modelId)
}

// ============ API 配置列表状态 ============
const currentAiCategoryId = ref('all')
const aiSearchQuery = ref('')
const aiSelectedIds = ref([])

const allAiCategories = computed(() => [
  { id: 'all', name: '全部', is_system: false },
  ...configStore.aiConfigCategories
])

const filteredAiConfigs = computed(() => {
  let list = configStore.aiConfigs
  if (currentAiCategoryId.value !== 'all') {
    list = list.filter(c => c.category_id === currentAiCategoryId.value)
  }
  if (aiSearchQuery.value) {
    const q = aiSearchQuery.value.toLowerCase()
    list = list.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.provider || '').toLowerCase().includes(q) ||
      (c.model || '').toLowerCase().includes(q)
    )
  }
  return list
})

const allAiSelected = computed(() =>
  filteredAiConfigs.value.length > 0 &&
  filteredAiConfigs.value.every(c => aiSelectedIds.value.includes(c.id))
)

const getAiCategoryName = (id) => {
  if (!id || id === 0) return '未分类'
  const c = configStore.aiConfigCategories.find(c => c.id === id)
  return c ? c.name : '未分类'
}

const getAiCategoryCount = (id) => {
  if (id === 'all') return configStore.aiConfigs.length
  return configStore.aiConfigs.filter(c => c.category_id === id).length
}

function toggleAiSelect(id) {
  const idx = aiSelectedIds.value.indexOf(id)
  if (idx > -1) aiSelectedIds.value.splice(idx, 1)
  else aiSelectedIds.value.push(id)
}

function toggleAiSelectAll() {
  if (allAiSelected.value) {
    aiSelectedIds.value = aiSelectedIds.value.filter(id => !filteredAiConfigs.value.some(c => c.id === id))
  } else {
    filteredAiConfigs.value.forEach(c => {
      if (!aiSelectedIds.value.includes(c.id)) aiSelectedIds.value.push(c.id)
    })
  }
}

// ============ API 配置编辑弹窗 ============
const aiEditing = ref(false)
const aiTestStatus = ref('')
const aiSaveMessage = ref('')
const aiSaveError = ref(false)
const aiConnTestStatus = ref({})  // { [id]: { state: 'idle'|'testing'|'ok'|'fail', msg: '' } }
const aiBatchTesting = ref(false)
const aiEditForm = reactive({
  id: null,
  name: '',
  category_id: 0,
  provider: 'siliconflow',
  api_key: '',
  api_url: '',
  model: '',
  // 模型参数（每个 API 配置独立存储）
  temperature: 0.8,
  top_p: 1.0,
  max_tokens: 4000,
  frequency_penalty: 0,
  presence_penalty: 0,
  image_max_tokens: 2000,
  enable_thinking: false
})

const testedModelsForForm = computed(() => configStore.testedModels[aiEditForm.provider] || [])

function resetAiForm() {
  aiEditForm.id = null
  aiEditForm.name = ''
  aiEditForm.category_id = currentAiCategoryId.value !== 'all' ? currentAiCategoryId.value : 0
  aiEditForm.provider = 'siliconflow'
  aiEditForm.api_key = ''
  aiEditForm.api_url = getDefaultApiUrl('siliconflow')
  aiEditForm.model = ''
  aiEditForm.temperature = 0.8
  aiEditForm.top_p = 1.0
  aiEditForm.max_tokens = 4000
  aiEditForm.frequency_penalty = 0
  aiEditForm.presence_penalty = 0
  aiEditForm.image_max_tokens = 2000
  aiEditForm.enable_thinking = false
  aiTestStatus.value = ''
  aiSaveMessage.value = ''
  aiSaveError.value = false
}

function openNewAi() {
  resetAiForm()
  aiEditing.value = true
}

function openEditAi(cfg) {
  resetAiForm()
  aiEditForm.id = cfg.id
  aiEditForm.name = cfg.name || ''
  aiEditForm.category_id = cfg.category_id || 0
  aiEditForm.provider = cfg.provider || 'siliconflow'
  aiEditForm.api_key = cfg.api_key || ''
  aiEditForm.api_url = cfg.api_url || ''
  aiEditForm.model = cfg.model || ''
  aiEditForm.temperature = cfg.temperature ?? 0.8
  aiEditForm.top_p = cfg.top_p ?? 1.0
  aiEditForm.max_tokens = cfg.max_tokens ?? 4000
  aiEditForm.frequency_penalty = cfg.frequency_penalty ?? 0
  aiEditForm.presence_penalty = cfg.presence_penalty ?? 0
  aiEditForm.image_max_tokens = cfg.image_max_tokens ?? 2000
  aiEditForm.enable_thinking = !!cfg.enable_thinking
  aiEditing.value = true
}

function closeAiEditor() {
  aiEditing.value = false
  aiTestStatus.value = ''
  aiSaveMessage.value = ''
  aiSaveError.value = false
}

function onAiProviderChange() {
  aiEditForm.api_url = getDefaultApiUrl(aiEditForm.provider)
}

function selectModelWithProvider(modelId, provider) {
  if (provider && provider !== aiEditForm.provider) {
    aiEditForm.provider = provider
    aiEditForm.api_url = getDefaultApiUrl(provider)
  }
  aiEditForm.model = modelId
}

async function removeTestedModel(modelId) {
  await configStore.removeTestedModel(aiEditForm.provider, modelId)
}

function getFormApiBaseUrl(form) {
  const provider = form.provider
  const apiUrl = form.api_url || ''
  if (provider === 'openrouter') return '/ai-api'
  if (provider === 'siliconflow') return '/siliconflow-api'
  if (provider === 'openai') return '/openai-api'
  if (provider === 'aliyun') return '/aliyun-api'
  if (provider === 'google') return '/google-api'
  if (provider === 'lmstudio') return '/lmstudio-api'
  if (provider === 'modelscope') return '/modelscope-api'
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl
}

async function testAiFormConnection() {

  if (!aiEditForm.api_key) { aiTestStatus.value = '请输入密钥'; return }
  if (!aiEditForm.model) { aiTestStatus.value = '请输入模型'; return }
  aiTestStatus.value = '测试中...'
  try {
    if (aiEditForm.provider === 'google') {
      const base = getFormApiBaseUrl(aiEditForm)
      const model = aiEditForm.model || 'gemini-2.0-flash'
      const resp = await fetch(`${base}/models/${model}:generateContent?key=${aiEditForm.api_key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      })
      if (resp.ok) {
        aiTestStatus.value = '连接成功（保存后请在列表点「使用」设为对话配置）'
        await configStore.addTestedModel(aiEditForm.provider, aiEditForm.model, getModelDisplayName(aiEditForm.model))
      } else {
        const ed = await resp.json().catch(() => ({}))
        if (resp.status === 429) aiTestStatus.value = '请求频繁'
        else if (resp.status === 401 || resp.status === 403) aiTestStatus.value = '密钥无效'
        else if (ed.error?.message) aiTestStatus.value = ed.error.message.substring(0, 8)
        else aiTestStatus.value = `错误${resp.status}`
      }
      return
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiEditForm.api_key}`
    }
    if (aiEditForm.provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin
      headers['X-Title'] = 'Character Generator'
    }
    const base = getFormApiBaseUrl(aiEditForm)
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: aiEditForm.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      })
    })
    if (resp.ok) {
      aiTestStatus.value = '连接成功（保存后请在列表点「使用」设为对话配置）'
      await configStore.addTestedModel(aiEditForm.provider, aiEditForm.model, getModelDisplayName(aiEditForm.model))
    } else {
      const ed = await resp.json().catch(() => ({}))
      if (resp.status === 429) aiTestStatus.value = '请求频繁'
      else if (resp.status === 401) aiTestStatus.value = '密钥无效'
      else if (ed.error?.message) aiTestStatus.value = ed.error.message.substring(0, 8)
      else aiTestStatus.value = `错误${resp.status}`
    }
  } catch (e) {
    if (e.message && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || e.message.includes('net::ERR'))) {
      aiTestStatus.value = '网络错误'
    } else {
      aiTestStatus.value = '连接失败: ' + (e.message ? e.message.substring(0, 15) : '未知错误')
    }
  }
}

async function saveAiConfig() {
  if (!aiEditForm.name) {
    aiSaveMessage.value = '请输入名称'
    aiSaveError.value = true
    return
  }
  const payload = {
    name: aiEditForm.name,
    category_id: aiEditForm.category_id || 0,
    provider: aiEditForm.provider,
    api_key: aiEditForm.api_key,
    api_url: aiEditForm.api_url,
    model: aiEditForm.model,
    temperature: aiEditForm.temperature,
    top_p: aiEditForm.top_p,
    max_tokens: aiEditForm.max_tokens,
    frequency_penalty: aiEditForm.frequency_penalty,
    presence_penalty: aiEditForm.presence_penalty,
    image_max_tokens: aiEditForm.image_max_tokens,
    enable_thinking: !!aiEditForm.enable_thinking
  }
  try {
    if (aiEditForm.id) {
      await apiClient.updateAiConfig(aiEditForm.id, payload)
      await configStore.loadAiConfigs()
      if (aiEditForm.id === configStore.activeAiConfigId) {
        await configStore.applyActiveAiConfig()
      }
    } else {
      await apiClient.createAiConfig(payload)
      await configStore.loadAiConfigs()
    }
    closeAiEditor()
  } catch (e) {
    aiSaveMessage.value = '保存失败: ' + (e.message || '未知错误')
    aiSaveError.value = true
  }
}

async function activateAiConfig(id) {
  try {
    await configStore.setActiveAiConfig(id)
  } catch (e) {
    console.error('激活AI配置失败:', e)
  }
}

// ============ ComfyUI 配置列表状态 ============
const currentComfyuiCategoryId = ref('all')
const comfyuiSearchQuery = ref('')
const comfyuiSelectedIds = ref([])

const allComfyuiCategories = computed(() => [
  { id: 'all', name: '全部', is_system: false },
  ...configStore.comfyuiConfigCategories
])

const filteredComfyuiConfigs = computed(() => {
  let list = configStore.comfyuiConfigs
  if (currentComfyuiCategoryId.value !== 'all') {
    list = list.filter(c => c.category_id === currentComfyuiCategoryId.value)
  }
  if (comfyuiSearchQuery.value) {
    const q = comfyuiSearchQuery.value.toLowerCase()
    list = list.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.comfyui_url || '').toLowerCase().includes(q) ||
      (c.download_dir || '').toLowerCase().includes(q)
    )
  }
  return list
})

const allComfyuiSelected = computed(() =>
  filteredComfyuiConfigs.value.length > 0 &&
  filteredComfyuiConfigs.value.every(c => comfyuiSelectedIds.value.includes(c.id))
)

const getComfyuiCategoryName = (id) => {
  if (!id || id === 0) return '未分类'
  const c = configStore.comfyuiConfigCategories.find(c => c.id === id)
  return c ? c.name : '未分类'
}

const getComfyuiCategoryCount = (id) => {
  if (id === 'all') return configStore.comfyuiConfigs.length
  return configStore.comfyuiConfigs.filter(c => c.category_id === id).length
}

function toggleComfyuiSelect(id) {
  const idx = comfyuiSelectedIds.value.indexOf(id)
  if (idx > -1) comfyuiSelectedIds.value.splice(idx, 1)
  else comfyuiSelectedIds.value.push(id)
}

function toggleComfyuiSelectAll() {
  if (allComfyuiSelected.value) {
    comfyuiSelectedIds.value = comfyuiSelectedIds.value.filter(id => !filteredComfyuiConfigs.value.some(c => c.id === id))
  } else {
    filteredComfyuiConfigs.value.forEach(c => {
      if (!comfyuiSelectedIds.value.includes(c.id)) comfyuiSelectedIds.value.push(c.id)
    })
  }
}

// ============ ComfyUI 配置编辑弹窗 ============
const comfyuiEditing = ref(false)
const comfyuiTestStatus = ref('')
const comfyuiConnTestStatus = ref({})  // { [id]: { state: 'idle'|'testing'|'ok'|'fail', msg: '' } }
const comfyuiBatchTesting = ref(false)
const comfyuiSaveMessage = ref('')
const comfyuiSaveError = ref(false)
const comfyuiEditForm = reactive({
  id: null,
  name: '',
  category_id: 0,
  comfyui_url: '',
  download_dir: '',
  auto_download: false,
  filename_prefix: ''
})

function resetComfyuiForm() {
  comfyuiEditForm.id = null
  comfyuiEditForm.name = ''
  comfyuiEditForm.category_id = currentComfyuiCategoryId.value !== 'all' ? currentComfyuiCategoryId.value : 0
  comfyuiEditForm.comfyui_url = 'http://127.0.0.1:8188'
  comfyuiEditForm.download_dir = ''
  comfyuiEditForm.auto_download = false
  comfyuiEditForm.filename_prefix = ''
  comfyuiTestStatus.value = ''
  comfyuiSaveMessage.value = ''
  comfyuiSaveError.value = false
}

function openNewComfyui() {
  resetComfyuiForm()
  comfyuiEditing.value = true
}

function openEditComfyui(cfg) {
  resetComfyuiForm()
  comfyuiEditForm.id = cfg.id
  comfyuiEditForm.name = cfg.name || ''
  comfyuiEditForm.category_id = cfg.category_id || 0
  comfyuiEditForm.comfyui_url = cfg.comfyui_url || ''
  comfyuiEditForm.download_dir = cfg.download_dir || ''
  comfyuiEditForm.auto_download = !!cfg.auto_download
  comfyuiEditForm.filename_prefix = cfg.filename_prefix || ''
  comfyuiEditing.value = true
}

function closeComfyuiEditor() {
  comfyuiEditing.value = false
  comfyuiTestStatus.value = ''
  comfyuiSaveMessage.value = ''
  comfyuiSaveError.value = false
}

async function testComfyuiFormUrl() {
  const url = comfyuiEditForm.comfyui_url
  if (!url) { comfyuiTestStatus.value = '请输入地址'; return }
  comfyuiTestStatus.value = '测试中...'
  try {
    const res = await apiClient.testComfyuiConnection(url)
    if (res.success) comfyuiTestStatus.value = '畅通'
    else comfyuiTestStatus.value = res.error || '连接失败'
  } catch (e) {
    comfyuiTestStatus.value = '连接失败'
  }
}

// ============ 列表行连通性测试 ============

function setAiTestState(id, state, msg = '') {
  aiConnTestStatus.value = { ...aiConnTestStatus.value, [id]: { state, msg } }
}

async function testAiConfig(cfg) {
  if (!cfg.api_key) { setAiTestState(cfg.id, 'fail', '未配置密钥'); return }
  if (!cfg.model) { setAiTestState(cfg.id, 'fail', '未配置模型'); return }
  setAiTestState(cfg.id, 'testing', '测试中...')
  try {
    const formData = { provider: cfg.provider, api_key: cfg.api_key, api_url: cfg.api_url, model: cfg.model, use_proxy: cfg.use_proxy }
    if (cfg.provider === 'google') {
      const base = getFormApiBaseUrl(formData)
      const model = cfg.model || 'gemini-2.0-flash'
      const resp = await fetch(`${base}/models/${model}:generateContent?key=${cfg.api_key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 5 } })
      })
      if (resp.ok) setAiTestState(cfg.id, 'ok', '畅通')
      else {
        const ed = await resp.json().catch(() => ({}))
        setAiTestState(cfg.id, 'fail', resp.status === 429 ? '请求频繁' : resp.status === 401 || resp.status === 403 ? '密钥无效' : (ed.error?.message || `错误${resp.status}`).substring(0, 50))
      }
      return
    }
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.api_key}` }
    if (cfg.provider === 'openrouter') { headers['HTTP-Referer'] = window.location.origin; headers['X-Title'] = 'Character Generator' }
    const base = getFormApiBaseUrl(formData)
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 })
    })
    if (resp.ok) setAiTestState(cfg.id, 'ok', '畅通')
    else {
      const ed = await resp.json().catch(() => ({}))
      setAiTestState(cfg.id, 'fail', resp.status === 429 ? '请求频繁' : resp.status === 401 ? '密钥无效' : (ed.error?.message || `错误${resp.status}`).substring(0, 50))
    }
  } catch (e) {
    setAiTestState(cfg.id, 'fail', (e.message || '连接失败').substring(0, 50))
  }
}

async function batchTestAi() {
  aiBatchTesting.value = true
  const configs = configStore.aiConfigs.filter(c => aiSelectedIds.value.includes(c.id))
  for (const cfg of configs) {
    await testAiConfig(cfg)
  }
  aiBatchTesting.value = false
}

async function toggleSingleCallable(cfg) {
  try {
    await apiClient.updateAiConfig(cfg.id, { is_callable: !cfg.is_callable })
    cfg.is_callable = !cfg.is_callable
  } catch (e) {
    console.error('切换可调用失败:', e)
  }
}

async function batchSetCallable(isCallable) {
  if (aiSelectedIds.value.length === 0) return
  try {
    await apiClient.batchSetAiConfigCallable(aiSelectedIds.value, isCallable)
    configStore.aiConfigs.forEach(c => {
      if (aiSelectedIds.value.includes(c.id)) c.is_callable = isCallable
    })
  } catch (e) {
    console.error('批量设置可调用失败:', e)
  }
}

function setComfyuiTestState(id, state, msg = '') {
  comfyuiConnTestStatus.value = { ...comfyuiConnTestStatus.value, [id]: { state, msg } }
}

async function testComfyuiConfig(cfg) {
  const url = cfg.comfyui_url
  if (!url) { setComfyuiTestState(cfg.id, 'fail', '未配置地址'); return }
  setComfyuiTestState(cfg.id, 'testing', '测试中...')
  try {
    const res = await apiClient.testComfyuiConnection(url)
    if (res.success) setComfyuiTestState(cfg.id, 'ok', '畅通')
    else setComfyuiTestState(cfg.id, 'fail', (res.error || '连接失败').substring(0, 50))
  } catch (e) {
    setComfyuiTestState(cfg.id, 'fail', (e.message || '连接失败').substring(0, 50))
  }
}

async function batchTestComfyui() {
  comfyuiBatchTesting.value = true
  const configs = configStore.comfyuiConfigs.filter(c => comfyuiSelectedIds.value.includes(c.id))
  for (const cfg of configs) {
    await testComfyuiConfig(cfg)
  }
  comfyuiBatchTesting.value = false
}

async function saveComfyuiConfig() {
  if (!comfyuiEditForm.name) {
    comfyuiSaveMessage.value = '请输入名称'
    comfyuiSaveError.value = true
    return
  }
  const payload = {
    name: comfyuiEditForm.name,
    category_id: comfyuiEditForm.category_id || 0,
    comfyui_url: comfyuiEditForm.comfyui_url,
    download_dir: comfyuiEditForm.download_dir,
    auto_download: !!comfyuiEditForm.auto_download,
    filename_prefix: comfyuiEditForm.filename_prefix
  }
  try {
    if (comfyuiEditForm.id) {
      await apiClient.updateComfyuiConfig(comfyuiEditForm.id, payload)
      await configStore.loadComfyuiConfigs()
      if (comfyuiEditForm.id === configStore.activeComfyuiConfigId) {
        await configStore.applyActiveComfyuiConfig()
      }
    } else {
      await apiClient.createComfyuiConfig(payload)
      await configStore.loadComfyuiConfigs()
    }
    closeComfyuiEditor()
  } catch (e) {
    comfyuiSaveMessage.value = '保存失败: ' + (e.message || '未知错误')
    comfyuiSaveError.value = true
  }
}

async function activateComfyuiConfig(id) {
  try {
    await configStore.setActiveComfyuiConfig(id)
  } catch (e) {
    console.error('激活ComfyUI配置失败:', e)
  }
}

async function toggleComfyuiActive(id) {
  try {
    await configStore.toggleActiveComfyuiConfig(id)
  } catch (e) {
    console.error('切换ComfyUI激活状态失败:', e)
  }
}

// ============ 分类弹窗（共享：AI / ComfyUI） ============
const catModal = reactive({
  show: false,
  mode: 'add', // 'add' | 'rename'
  scope: 'ai', // 'ai' | 'comfyui'
  name: '',
  target: null
})

function openAddCategory(scope) {
  catModal.show = true
  catModal.mode = 'add'
  catModal.scope = scope
  catModal.name = ''
  catModal.target = null
}

function openRenameCategory(scope, cat) {
  catModal.show = true
  catModal.mode = 'rename'
  catModal.scope = scope
  catModal.name = cat.name
  catModal.target = cat
}

async function doCategoryModalSave() {
  if (!catModal.name) return
  try {
    if (catModal.mode === 'add') {
      if (catModal.scope === 'ai') {
        await apiClient.createAiConfigCategory({ name: catModal.name })
        await configStore.loadAiConfigCategories()
      } else {
        await apiClient.createComfyuiConfigCategory({ name: catModal.name })
        await configStore.loadComfyuiConfigCategories()
      }
    } else if (catModal.mode === 'rename' && catModal.target) {
      if (catModal.scope === 'ai') {
        await apiClient.updateAiConfigCategory(catModal.target.id, { name: catModal.name })
        await configStore.loadAiConfigCategories()
      } else {
        await apiClient.updateComfyuiConfigCategory(catModal.target.id, { name: catModal.name })
        await configStore.loadComfyuiConfigCategories()
      }
    }
    catModal.show = false
  } catch (e) {
    console.error('分类操作失败:', e)
  }
}

// ============ 批量移动弹窗 ============
const batchMoveModal = reactive({
  show: false,
  scope: 'ai',
  targetCategoryId: 0
})

const batchMoveSelectedCount = computed(() =>
  batchMoveModal.scope === 'ai' ? aiSelectedIds.value.length : comfyuiSelectedIds.value.length
)

const batchMoveCategoryList = computed(() =>
  batchMoveModal.scope === 'ai' ? configStore.aiConfigCategories : configStore.comfyuiConfigCategories
)

function openBatchMove(scope) {
  batchMoveModal.scope = scope
  batchMoveModal.targetCategoryId = 0
  batchMoveModal.show = true
}

async function doBatchMove() {
  try {
    if (batchMoveModal.scope === 'ai') {
      await apiClient.batchCategorizeAiConfigs(aiSelectedIds.value, batchMoveModal.targetCategoryId)
      aiSelectedIds.value = []
      await configStore.loadAiConfigs()
    } else {
      await apiClient.batchCategorizeComfyuiConfigs(comfyuiSelectedIds.value, batchMoveModal.targetCategoryId)
      comfyuiSelectedIds.value = []
      await configStore.loadComfyuiConfigs()
    }
    batchMoveModal.show = false
  } catch (e) {
    console.error('批量移动失败:', e)
  }
}

// ============ 删除确认 ============
const deleteConfirm = reactive({
  show: false,
  type: '',
  target: null,
  message: ''
})

// Writable computed proxies for FloatingWindow v-model:open
const catModalOpen = computed({
  get: () => catModal.show,
  set: (v) => { if (!v) catModal.show = false }
})
const batchMoveModalOpen = computed({
  get: () => batchMoveModal.show,
  set: (v) => { if (!v) batchMoveModal.show = false }
})
const aiEditingOpen = computed({
  get: () => aiEditing.value,
  set: (v) => { if (!v) closeAiEditor() }
})
const comfyuiEditingOpen = computed({
  get: () => comfyuiEditing.value,
  set: (v) => { if (!v) closeComfyuiEditor() }
})
const deleteConfirmOpen = computed({
  get: () => deleteConfirm.show,
  set: (v) => { if (!v) deleteConfirm.show = false }
})

function confirmDelete(type, target = null) {
  if (type === 'ai-category') {
    deleteConfirm.message = `确定要删除分类"${target.name}"吗？\n该分类下的配置将移到"未分类"`
  } else if (type === 'ai-config') {
    deleteConfirm.message = `确定要删除"${target.name}"吗？`
  } else if (type === 'ai-batch') {
    deleteConfirm.message = `确定要删除选中的 ${aiSelectedIds.value.length} 个配置吗？`
  } else if (type === 'comfyui-category') {
    deleteConfirm.message = `确定要删除分类"${target.name}"吗？\n该分类下的配置将移到"未分类"`
  } else if (type === 'comfyui-config') {
    deleteConfirm.message = `确定要删除"${target.name}"吗？`
  } else if (type === 'comfyui-batch') {
    deleteConfirm.message = `确定要删除选中的 ${comfyuiSelectedIds.value.length} 个配置吗？`
  }
  deleteConfirm.type = type
  deleteConfirm.target = target
  deleteConfirm.show = true
}

async function doDelete() {
  const { type, target } = deleteConfirm
  deleteConfirm.show = false
  try {
    if (type === 'ai-category') {
      await apiClient.deleteAiConfigCategory(target.id)
      if (currentAiCategoryId.value === target.id) currentAiCategoryId.value = 'all'
      await configStore.loadAiConfigCategories()
      await configStore.loadAiConfigs()
    } else if (type === 'ai-config') {
      await apiClient.deleteAiConfig(target.id)
      await configStore.loadAiConfigs()
    } else if (type === 'ai-batch') {
      await apiClient.batchDeleteAiConfigs(aiSelectedIds.value)
      aiSelectedIds.value = []
      await configStore.loadAiConfigs()
    } else if (type === 'comfyui-category') {
      await apiClient.deleteComfyuiConfigCategory(target.id)
      if (currentComfyuiCategoryId.value === target.id) currentComfyuiCategoryId.value = 'all'
      await configStore.loadComfyuiConfigCategories()
      await configStore.loadComfyuiConfigs()
    } else if (type === 'comfyui-config') {
      await apiClient.deleteComfyuiConfig(target.id)
      await configStore.loadComfyuiConfigs()
    } else if (type === 'comfyui-batch') {
      await apiClient.batchDeleteComfyuiConfigs(comfyuiSelectedIds.value)
      comfyuiSelectedIds.value = []
      await configStore.loadComfyuiConfigs()
    }
  } catch (e) {
    console.error('删除失败:', e)
  }
}

// ============ 初始化 ============
onMounted(async () => {
  await loadWorkflowList()
  await loadBatchPrompts()
  loadEditorSettings()
  if (!apiClient.isLoggedIn()) return
  try {
    await configStore.loadAiConfigCategories()
    await configStore.loadAiConfigs()
    await configStore.loadComfyuiConfigCategories()
    await configStore.loadComfyuiConfigs()
  } catch (e) {
    console.error('加载配置列表失败:', e)
  }
})
</script>

<style scoped>
.settings-panel {
  background: transparent;
  border-radius: 0;
  padding: 20px;
  box-shadow: none;
}

.settings-panel h2 {
  margin: 0 0 20px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-panel h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

/* 标签页 */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  background: transparent;
  padding: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--border-color);
}

.tab-item {
  flex: 1;
  padding: 10px 16px;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
}

.tab-item:hover {
  color: var(--text-primary);
}

.tab-item.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-color, #4a9eff);
  box-shadow: none;
}

.tab-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 分类栏 */
.category-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}

.category-tabs {
  display: flex;
  gap: 4px;
  padding: 0;
  background: transparent;
  border-radius: 0;
  flex-wrap: wrap;
  flex: 1;
  border-bottom: 1px solid var(--border-color);
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
  white-space: nowrap;
  position: relative;
}

.category-tab:hover {
  color: var(--text-primary);
}

.category-tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-color, #4a9eff);
}

.cat-name {
  font-size: 15px;
}

.cat-count {
  font-size: 11px;
  opacity: 0.7;
}

.cat-actions {
  display: none;
  gap: 2px;
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 4px;
  z-index: 10;
}

.category-tab:hover .cat-actions {
  display: flex;
}

.cat-action-btn {
  padding: 1px 4px;
  background: transparent;
  border: 1px solid var(--text-muted, #555);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 10px;
  cursor: pointer;
  line-height: 1.2;
}

.cat-action-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.cat-action-btn.danger:hover {
  background: #fee2e2;
  color: #ef4444;
  border-color: #ef4444;
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  width: 200px;
  box-shadow: none;
  box-sizing: border-box;
}

/* 列表 */
.config-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
}

.ai-grid {
  display: grid;
  grid-template-columns: 40px 1.3fr 96px 1.2fr 80px 88px 90px 210px;
  align-items: center;
  padding: 10px 12px;
  gap: 8px;
}

.comfyui-grid {
  display: grid;
  grid-template-columns: 40px 1.1fr 1.5fr 1fr 90px 110px 200px;
  align-items: center;
  padding: 10px 12px;
  gap: 8px;
}

.list-header {
  background: var(--bg-secondary);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128, 128, 128, 0.1));
}

.list-row {
  font-size: 13px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128, 128, 128, 0.05));
  transition: background 0.15s ease;
}

.list-row:hover {
  background: var(--bg-secondary);
}

.list-row.selected {
  background: rgba(74, 158, 255, 0.08);
}

.list-row:last-child {
  border-bottom: none;
}

.col-check {
  display: flex;
  justify-content: center;
  cursor: pointer;
}

.checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-muted);
  border-radius: 4px;
  transition: all 0.15s ease;
}

.checkbox.checked {
  background: var(--accent-color);
  border-color: var(--accent-color);
  position: relative;
}

.checkbox.checked::after {
  content: '✓';
  color: white;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.col-name {
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* "使用中"标记：对话实际调用的就是这条配置 */
.use-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(76, 175, 80, 0.16);
  color: #2e7d32;
  border: 1px solid rgba(76, 175, 80, 0.45);
}

.ai-config-hint {
  margin: 8px 0 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.col-name:hover {
  color: var(--accent-color);
}

.col-provider,
.col-model,
.col-url,
.col-dir {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-status {
  font-size: 12px;
}

.col-callable {
  font-size: 12px;
  display: flex;
  align-items: center;
}

.col-cat {
  font-size: 12px;
  color: var(--text-secondary);
}

.col-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.status-badge.active {
  background: rgba(76, 175, 80, 0.15);
  color: #4CAF50;
}

.status-badge.muted {
  background: rgba(128, 128, 128, 0.12);
  color: var(--text-muted);
}

/* 连通性测试文字按钮 */
.conn-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  min-width: 56px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 12px;
  background: rgba(128, 128, 128, 0.12);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.conn-btn:hover {
  background: rgba(128, 128, 128, 0.22);
}

.conn-btn.testing {
  border-color: rgba(255, 193, 7, 0.5);
  background: rgba(255, 193, 7, 0.15);
  color: #b8860b;
}

.conn-btn.ok {
  border-color: rgba(0, 255, 102, 0.6);
  background: rgba(0, 255, 102, 0.18);
  color: #00ff66;
  text-shadow: 0 0 6px rgba(0, 255, 102, 0.9), 0 0 12px rgba(0, 255, 102, 0.6);
  box-shadow: 0 0 8px rgba(0, 255, 102, 0.5), inset 0 0 6px rgba(0, 255, 102, 0.25);
  animation: conn-glow 1.8s ease-in-out infinite;
}

.conn-btn.fail {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

@keyframes conn-glow {
  0%, 100% {
    box-shadow: 0 0 6px rgba(0, 255, 102, 0.45), inset 0 0 4px rgba(0, 255, 102, 0.2);
  }
  50% {
    box-shadow: 0 0 14px rgba(0, 255, 102, 0.85), inset 0 0 8px rgba(0, 255, 102, 0.4);
  }
}

/* 可调用按钮 */
.callable-btn {
  padding: 3px 10px;
  min-width: 64px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 12px;
  background: rgba(128, 128, 128, 0.12);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.callable-btn:hover {
  background: rgba(128, 128, 128, 0.22);
}

.callable-btn.on {
  border-color: rgba(0, 255, 102, 0.6);
  background: rgba(0, 255, 102, 0.18);
  color: #00ff66;
  text-shadow: 0 0 6px rgba(0, 255, 102, 0.9), 0 0 12px rgba(0, 255, 102, 0.6);
  box-shadow: 0 0 8px rgba(0, 255, 102, 0.5), inset 0 0 6px rgba(0, 255, 102, 0.25);
  animation: conn-glow 1.8s ease-in-out infinite;
}

/* ComfyUI 激活按钮绿色 */
.btn-activate-active {
  background: rgba(76, 175, 80, 0.2) !important;
  color: #4CAF50 !important;
  border-color: #4CAF50 !important;
}

.btn-icon-sm {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-icon-sm:hover:not(:disabled) {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--accent-color);
}

.btn-icon-sm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-icon-sm.danger:hover:not(:disabled) {
  background: #fee2e2;
  color: #ef4444;
  border-color: #ef4444;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

/* 表单组 */
.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.form-group input[type="text"],
.form-group input[type="password"],
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  box-shadow: var(--input-shadow);
}

.form-group select {
  cursor: pointer;
}

.form-group select option {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.checkbox-label {
  margin-left: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.input-with-button {
  display: flex;
  gap: 8px;
}

.input-with-button input {
  flex: 1;
}

.test-inline-status {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 模型快选 */
.model-quick-select {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.model-quick-select small {
  color: var(--text-secondary);
  font-size: 12px;
}

.model-btn-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.model-btn {
  padding: 4px 10px !important;
  font-size: 11px !important;
  background: var(--bg-secondary) !important;
  color: var(--text-secondary) !important;
  border: none !important;
  border-radius: 6px !important;
  cursor: pointer;
  transition: all 0.15s ease;
}

.model-btn:hover {
  background: var(--bg-primary) !important;
  color: var(--text-primary) !important;
}

.model-remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  padding: 0 !important;
  background: #ff5252 !important;
  color: white !important;
  border: none !important;
  border-radius: 50% !important;
  cursor: pointer;
  font-size: 12px !important;
  line-height: 1 !important;
  opacity: 0;
  transition: opacity 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.model-btn-wrapper:hover .model-remove-btn {
  opacity: 1;
}

.model-remove-btn:hover {
  background: #ff1744 !important;
  transform: scale(1.1);
}

/* AI 测试连接行 */
.ai-test-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0 14px;
}

.test-ai-btn {
  background: #ff9800 !important;
  color: white !important;
}

.test-ai-btn:hover {
  opacity: 0.85;
}

.test-ai-status {
  font-size: 13px;
  color: var(--text-secondary);
}

.test-comfyui-btn {
  background: var(--accent-color);
  color: var(--accent-text);
}

.test-comfyui-btn:hover {
  opacity: 0.85;
}

.edit-message {
  margin-top: 8px;
  font-size: 13px;
  color: #ef4444;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
}

/* 按钮 */
.btn {
  padding: 8px 16px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: none;
}

.btn:hover:not(:disabled) {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--accent-color, #4a9eff);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-color);
  color: var(--accent-text);
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

/* 对话配置 tab 中的保存按钮（保留原样式） */
.tab-content > button {
  padding: 8px 16px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: var(--input-shadow);
}

/* ============ 分镜解析配置 ============ */
.parser-tip {
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-left: 3px solid var(--accent-color, #4a9eff);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  margin: 8px 0 16px;
}

.parser-actions {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.parser-divider {
  border: none;
  border-top: 1px dashed var(--border-color, rgba(128, 128, 128, 0.3));
  margin: 20px 0;
}

.parser-test-result {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
}

.parser-test-result h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: var(--text-primary);
}

.result-summary {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.result-summary strong {
  color: var(--accent-color, #4a9eff);
  font-size: 16px;
}

.parsed-storyboard {
  background: var(--bg-surface);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border-left: 3px solid var(--accent-color, #4a9eff);
}

.parsed-header {
  font-weight: 600;
  font-size: 13px;
  color: var(--accent-color, #4a9eff);
  margin-bottom: 6px;
}

.parsed-fields > div {
  display: flex;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  word-break: break-word;
}

.parsed-fields .field-label {
  flex-shrink: 0;
  width: 130px;
  color: var(--text-secondary);
  font-weight: 500;
}

.form-group code {
  background: var(--bg-secondary);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: var(--accent-color, #4a9eff);
}

.fw-body p {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.fw-confirm-msg {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-line;
  line-height: 1.6;
}

/* ============ 模型参数整合样式 ============ */
.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-row-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

.model-params-title {
  margin: 18px 0 8px 0;
  padding-bottom: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
}

.model-params-section {
  padding: 4px 0;
}

.thinking-toggle-group {
  margin-top: 4px;
}
.thinking-toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 600;
}
.thinking-toggle-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.hint-text {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary, #999);
}

.slider-group {
  margin-bottom: 8px;
}

/* 简化滑条样式：无外框、无线条、无阴影 */
.simple-slider {
  width: 100%;
  height: 6px;
  background: var(--bg-secondary, #e5e7eb);
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  margin: 6px 0;
  padding: 0;
  border: none;
  box-shadow: none;
}

.simple-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent-color, #3b82f6);
  cursor: pointer;
  border: none;
  box-shadow: none;
}

.simple-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent-color, #3b82f6);
  cursor: pointer;
  border: none;
  box-shadow: none;
}

/* ============ 分镜解析子选项卡样式 ============ */
.parser-sub-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.parser-sub-tab {
  padding: 8px 14px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  white-space: nowrap;
}

.parser-sub-tab:hover {
  color: var(--text-primary);
}

.parser-sub-tab.active {
  color: var(--accent-color, #3b82f6);
  border-bottom-color: var(--accent-color, #3b82f6);
  font-weight: 500;
}

.parser-sub-content {
  padding-top: 4px;
}

.parser-test-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

/* 工具栏按钮高度与输入框对齐 */
.parser-test-toolbar .btn {
  padding: 6px 16px;
  height: 34px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.parser-test-toolbar .parser-name-input {
  height: 34px;
  box-sizing: border-box;
}

/* 批量提示词 + 按钮 */
.batch-add-btn {
  min-width: 34px;
  font-size: 18px;
  font-weight: 600;
  padding: 0 !important;
}

/* 分镜文件编辑模式的保存状态提示 */
.storyboard-save-ok { color: #16a085; font-size: 13px; align-self: center; white-space: nowrap; }
.storyboard-save-err { color: #e74c3c; font-size: 13px; align-self: center; white-space: nowrap; }


.parser-name-input {
  flex: 1;
  min-width: 200px;
  padding: 6px 10px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
}

.parser-name-input:focus {
  outline: none;
  border-color: var(--accent-color, #3b82f6);
}

.parser-save-tip {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

/* ============ 批量提示词样式 ============ */
.batch-prompt-group {
  position: relative;
}

.batch-prompt-wrapper {
  position: relative;
}

.batch-prompt-wrapper textarea,
.batch-prompt-wrapper .batch-content-editor {
  width: calc(100% - 38px);
  height: 120px;
  min-height: 0;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid rgba(128, 128, 128, 0.6);
  border-radius: 8px;
  box-shadow: none;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
}

.batch-prompt-wrapper textarea:focus,
.batch-prompt-wrapper .batch-content-editor:focus {
  outline: none;
  border-color: var(--accent-color, #3b82f6);
  box-shadow: none;
}

.batch-prompt-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  padding: 0;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

.batch-prompt-wrapper:hover .batch-prompt-delete {
  opacity: 1;
}

.batch-prompt-delete:hover {
  background: #ef4444;
  transform: scale(1.1);
}

/* ---- 编辑设置（AI 文字编辑） ---- */
.editor-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 720px;
}

.es-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 30px;
}

.es-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 180px;
}

.es-sep {
  height: 1px;
  background: var(--border-color, rgba(128, 128, 128, 0.25));
  margin: 2px 0;
}

.es-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.es-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.es-field-wide {
  margin-top: 4px;
}

.es-field label {
  font-size: 12px;
  color: var(--text-secondary);
}

.es-field select,
.es-field input {
  padding: 6px 9px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
}

.es-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.es-msg {
  font-size: 12px;
  color: #16a34a;
}

.es-msg-err {
  color: #ef4444;
}

/* 迷你开关 */
.switch-mini {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  margin: 0;
}

.switch-mini input[type='checkbox'] {
  display: none;
}

.switch-slider {
  width: 32px;
  height: 18px;
  background: var(--bg-tertiary, rgba(128, 128, 128, 0.35));
  border-radius: 9px;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}

.switch-mini input:checked + .switch-slider {
  background: var(--accent-color, #4a9eff);
}

.switch-slider::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
}

.switch-mini input:checked + .switch-slider::after {
  transform: translateX(14px);
}

.switch-label {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
