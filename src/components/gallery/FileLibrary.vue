<template>
  <div
    class="file-library"
    :class="{ 'drag-over': listDropIsOver && listDropAccept, 'drag-forbidden': listDropIsOver && !listDropAccept }"
    @dragover="onListDragOver"
    @dragleave="onListDragLeave"
    @drop="onListDrop"
  >
    <!-- 上传区域切换条 -->
    <div v-if="!showRecycleBin" class="upload-toggle-bar">
      <button class="upload-toggle-btn" @click="showUploadZone = !showUploadZone">
        <span class="toggle-arrow">{{ showUploadZone ? '▼' : '▶' }}</span>
        <span>上传区域</span>
      </button>
    </div>

    <!-- 上传区域：双上传框（普通文件 / TXT 转分镜 JSON） -->
    <div class="upload-row" v-if="!showRecycleBin && showUploadZone">
      <div
        class="upload-zone general-zone"
        :class="{ dragover: isDragOver }"
        @dragover.prevent.stop="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent.stop="handleDrop"
        @click="triggerFileInput"
      >
        <input
          type="file"
          ref="fileInput"
          multiple
          accept="image/*,video/*,audio/*,.json,.txt,.md"
          @change="handleFileSelect"
          style="display: none"
        />
        <div class="upload-text">
          <p class="zone-title general-title">上传文件</p>
          <small>点击或拖拽 图片/视频/音频/JSON/TXT/MD 到此处上传（自动识别类型）</small>
          <div class="upload-target">上传到：{{ uploadTargetLabel }}</div>
        </div>
      </div>
      <div
        class="upload-zone txt-zone"
        :class="{ dragover: isTxtDragOver }"
        @dragover.prevent.stop="isTxtDragOver = true"
        @dragleave.prevent="isTxtDragOver = false"
        @drop.prevent.stop="handleTxtDrop"
        @click="triggerTxtFileInput"
      >
        <input
          type="file"
          ref="txtFileInput"
          multiple
          accept=".txt"
          @change="handleTxtFileSelect"
          style="display: none"
        />
        <div class="upload-text">
          <p class="zone-title txt-title">TXT 转批量分镜 JSON</p>
          <small>点击或拖拽 .txt 文件，自动解析分镜并转换为 JSON 文件</small>
          <div class="upload-target">转换到：{{ uploadTargetLabel }}</div>
        </div>
      </div>
    </div>

    <!-- TXT 转换进度区 -->
    <div v-if="convertProgress.length > 0" class="convert-progress">
      <div class="progress-header">
        <span class="progress-title">TXT 转换记录</span>
        <span class="progress-summary">
          成功 {{ txtSuccessCount }} / 失败 {{ txtFailCount }} / 共 {{ convertProgress.length }}
          <span v-if="isConverting" class="converting-tag">转换中…</span>
          <button v-else class="btn-clear-progress" @click="convertProgress = []">清空记录</button>
        </span>
      </div>
      <div class="progress-list">
        <div
          v-for="(item, idx) in convertProgress"
          :key="idx"
          :class="['progress-item', item.status]"
        >
          <span class="progress-name" :title="item.name">{{ item.name }}</span>
          <span class="progress-status">
            <span v-if="item.status === 'success'" class="tag-ok">✓ 成功</span>
            <span v-else-if="item.status === 'fail'" class="tag-fail">✗ 失败{{ item.message ? '：' + item.message : '' }}</span>
            <span v-else class="tag-pending">转换中…</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 分类栏 -->
    <div class="category-bar">
      <div class="category-tabs">
        <!-- 系统分类（总库、UI库） -->
        <div
          v-for="cat in systemCategories"
          :key="cat.id"
          :class="['category-tab', { active: !showRecycleBin && fileLibraryStore.currentCategoryId === cat.id }]"
          @click="onCategoryClick(cat.id)"
        >
          <span class="cat-name">{{ cat.name }}</span>
        </div>
        <!-- 分隔符 -->
        <span v-if="customCategories.length > 0" class="category-divider">|</span>
        <!-- 自定义分类 -->
        <div
          v-for="cat in customCategories"
          :key="cat.id"
          :class="['category-tab', { active: !showRecycleBin && fileLibraryStore.currentCategoryId === cat.id }]"
          @click="onCategoryClick(cat.id)"
        >
          <span class="cat-name">{{ cat.name }}</span>
          <span class="cat-actions" @click.stop>
            <button class="cat-action-btn" @click="renameCategory(cat)" title="重命名">改</button>
            <button class="cat-action-btn danger" @click="confirmDeleteCategory(cat)" title="删除">删</button>
          </span>
        </div>
      </div>
      <button class="btn btn-sm" @click="showAddCategory = true">+ 添加分类</button>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <button v-if="!showRecycleBin" class="btn btn-sm" @click="toggleSelectAll">
          {{ allSelected && allFolderSelected ? '取消' : '全选' }}
        </button>
        <button v-if="!showRecycleBin" class="btn btn-icon-toggle" @click="reloadCurrent" title="刷新">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
        </button>
        <button
          v-if="!showRecycleBin"
          class="btn btn-icon-toggle"
          :class="{ active: viewMode === 'grid' }"
          @click="viewMode = 'grid'"
          title="网格显示"
        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg></button>
        <button
          v-if="!showRecycleBin"
          class="btn btn-icon-toggle"
          :class="{ active: viewMode === 'list' }"
          @click="viewMode = 'list'"
          title="列表显示"
        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="5" y2="6"></line><line x1="3" y1="12" x2="5" y2="12"></line><line x1="3" y1="18" x2="5" y2="18"></line></svg></button>
        <span v-if="!showRecycleBin" class="btn-divider">|</span>
        <button
          v-if="!showRecycleBin"
          :disabled="selectedIds.length === 0 && selectedFolderIds.length === 0"
          class="btn btn-sm btn-danger"
          @click="confirmBatchDelete"
        >删除 ({{ selectedIds.length + selectedFolderIds.length }})</button>
        <button
          v-if="!showRecycleBin"
          :disabled="selectedIds.length === 0 && selectedFolderIds.length === 0"
          class="btn btn-sm"
          @click="openBatchMove"
        >移动</button>
        <button
          v-if="!showRecycleBin"
          :disabled="selectedIds.length === 0"
          class="btn btn-sm"
          @click="openBatchTag"
        >打标签</button>
        <!-- 标签筛选（仅图标） -->
        <div v-if="!showRecycleBin" class="tag-filter-area">
          <button class="btn btn-icon-toggle" @click="showTagFilter = !showTagFilter" title="标签筛选">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
          </button>
          <div v-if="selectedTagFilters.length > 0" class="selected-tags">
            <span
              v-for="tagId in selectedTagFilters"
              :key="tagId"
              class="filter-tag-chip"
              :style="{ background: getTagColor(tagId) }"
              @mouseenter="hoveredTagFilter = tagId"
              @mouseleave="hoveredTagFilter = null"
            >
              {{ getTagName(tagId) }}
              <button v-if="hoveredTagFilter === tagId" class="filter-tag-remove" @click.stop="removeTagFilter(tagId)">×</button>
            </span>
          </div>
        </div>
        <!-- 回收站按钮（仅图标） -->
        <button
          v-if="!showRecycleBin"
          class="btn btn-icon-toggle"
          @click="toggleRecycleBin"
          title="回收站"
        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
      </div>
      <div class="toolbar-right" v-if="!showRecycleBin">
        <select v-model="filterType" class="filter-select">
          <option value="all">全部类型</option>
          <option v-for="(t, key) in FILE_TYPES" :key="key" :value="key">
            {{ t.label }}
          </option>
        </select>
        <input
          type="text"
          v-model="searchQuery"
          placeholder="搜索文件名..."
          class="search-input"
        />
      </div>
    </div>

    <!-- 面包屑路径导航 -->
    <div class="breadcrumb" v-if="!showRecycleBin && fileLibraryStore.breadcrumb.length > 0">
      <span class="breadcrumb-label">路径：</span>
      <template v-for="(item, idx) in fileLibraryStore.breadcrumb" :key="idx">
        <span
          class="breadcrumb-item"
          :class="{ active: idx === fileLibraryStore.breadcrumb.length - 1 }"
          @click="fileLibraryStore.navigateToBreadcrumb(idx)"
        >{{ item.name }}<span v-if="idx === 0" class="breadcrumb-count">({{ currentCategoryFileCount }})</span></span>
        <span v-if="idx < fileLibraryStore.breadcrumb.length - 1" class="breadcrumb-sep">›</span>
      </template>
    </div>

    <!-- 创建按钮行 -->
    <div class="create-buttons-row" v-if="!showRecycleBin">
      <button class="btn btn-sm" @click="openNewFolder">+ 文件夹</button>
      <button class="btn btn-sm" @click="openNewPromptDialog">+ 规则提示词</button>
      <button class="btn btn-sm" @click="openNewJsonStoryboardDialog">+ json分镜</button>
      <button class="btn btn-sm" @click="openNewBatchPromptsDialog">+ 批量提示词</button>
    </div>

    <!-- 标签筛选弹窗 -->
    <FloatingWindow v-model:open="showTagFilter" title="标签筛选" size="default">
      <div class="tag-filter-list">
        <span
          v-for="tag in fileLibraryStore.tags"
          :key="tag.id"
          :class="['tag-option', { selected: selectedTagFilters.includes(tag.id) }]"
          :style="{ background: selectedTagFilters.includes(tag.id) ? (tag.color || '#666') : 'transparent', borderColor: tag.color || '#666' }"
          @click="toggleTagFilter(tag.id)"
        >{{ tag.name }}</span>
        <span v-if="fileLibraryStore.tags.length === 0" class="empty-hint">暂无标签</span>
      </div>
      <template #footer>
        <button class="btn" @click="selectedTagFilters = []; showTagFilter = false">清除筛选</button>
        <button class="btn btn-primary" @click="showTagFilter = false">确定</button>
      </template>
    </FloatingWindow>

    <!-- 文件夹列表 -->
    <div class="folder-section" v-if="!showRecycleBin">
      <!-- 网格视图 -->
      <div class="folder-list folder-list-grid" v-if="fileLibraryStore.folders.length > 0 && viewMode === 'grid'">
        <div
          v-for="folder in fileLibraryStore.folders"
          :key="folder.id"
          :class="['folder-card', { selected: selectedFolderIds.includes(folder.id) }]"
          @dblclick="fileLibraryStore.navigateToFolder(folder.id)"
        >
          <div class="folder-card-top">
            <div class="folder-check" @click.stop="toggleSelectFolder(folder.id)">
              <div :class="['checkbox', { checked: selectedFolderIds.includes(folder.id) }]"></div>
            </div>
            <div class="folder-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></div>
            <div class="folder-info">
              <div class="folder-name">
                {{ folder.name }}
                <span v-if="folder.is_callable" class="callable-badge">可调用</span>
              </div>
              <div class="folder-meta">
                <span>{{ folder.file_count ?? 0 }} 文件</span>
                <span>{{ folder.subfolder_count ?? 0 }} 子文件夹</span>
              </div>
            </div>
          </div>
          <div class="folder-actions" @click.stop>
            <button class="btn-icon-sm" @click="fileLibraryStore.navigateToFolder(folder.id)" title="打开">打开</button>
            <button class="btn-icon-sm" @click="renameFolder(folder)" title="重命名">改名</button>
            <button
              class="btn-icon-sm"
              @click="toggleCallable(folder)"
              :title="folder.is_callable ? '取消可调用' : '设为可调用'"
            >{{ folder.is_callable ? '取消调用' : '设可调用' }}</button>
            <button class="btn-icon-sm danger" @click="confirmDeleteFolder(folder)" title="删除">删除</button>
          </div>
        </div>
      </div>
      <!-- 列表视图 -->
      <div class="folder-list folder-list-rows" v-else-if="fileLibraryStore.folders.length > 0 && viewMode === 'list'">
        <div class="folder-row-header">
          <div class="col-check"></div>
          <div class="folder-col-icon">类型</div>
          <div class="folder-col-name">名称</div>
          <div class="folder-col-meta">内容</div>
          <div class="folder-col-actions">操作</div>
        </div>
        <div
          v-for="folder in fileLibraryStore.folders"
          :key="folder.id"
          :class="['folder-row', { selected: selectedFolderIds.includes(folder.id) }]"
          @dblclick="fileLibraryStore.navigateToFolder(folder.id)"
        >
          <div class="col-check" @click.stop="toggleSelectFolder(folder.id)">
            <div :class="['checkbox', { checked: selectedFolderIds.includes(folder.id) }]"></div>
          </div>
          <div class="folder-col-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></div>
          <div class="folder-col-name">
            {{ folder.name }}
            <span v-if="folder.is_callable" class="callable-badge">可调用</span>
          </div>
          <div class="folder-col-meta">
            {{ folder.file_count ?? 0 }} 文件 / {{ folder.subfolder_count ?? 0 }} 子文件夹
          </div>
          <div class="folder-col-actions" @click.stop>
            <button class="btn-icon-sm" @click="fileLibraryStore.navigateToFolder(folder.id)" title="打开">打开</button>
            <button class="btn-icon-sm" @click="renameFolder(folder)" title="重命名">改名</button>
            <button
              class="btn-icon-sm"
              @click="toggleCallable(folder)"
              :title="folder.is_callable ? '取消可调用' : '设为可调用'"
            >{{ folder.is_callable ? '取消调用' : '设可调用' }}</button>
            <button class="btn-icon-sm danger" @click="confirmDeleteFolder(folder)" title="删除">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="empty-hint">当前目录暂无文件夹</div>
    </div>

    <!-- 文件列表 - 网格视图 -->
    <div class="file-grid" v-if="!showRecycleBin && filteredFiles.length > 0 && viewMode === 'grid'">
      <div
        v-for="file in filteredFiles"
        :key="file.id"
        :class="['file-card', { selected: selectedIds.includes(file.id) }]"
        @mouseenter="onFileMouseEnter($event, file)"
        @mouseleave="onFileMouseLeave"
        @mousemove="onFileMouseMove"
      >
        <div class="card-thumb" @click="previewFile(file)">
          <img
            v-if="file.file_type === 'image' && thumbSrc(file)"
            :src="thumbSrc(file)"
            :alt="file.name"
          />
          <video
            v-else-if="file.file_type === 'video' && thumbSrc(file)"
            :src="thumbSrc(file)"
            muted
          ></video>
          <div v-else class="thumb-icon" :style="{ color: fileTypeColor(file.file_type) }">
            {{ fileLibraryStore.getFileTypeIcon(file.file_type) }}
          </div>
          <div class="thumb-check" @click.stop="toggleSelect(file.id)">
            <div :class="['checkbox', { checked: selectedIds.includes(file.id) }]"></div>
          </div>
        </div>
        <div class="card-info">
          <div class="card-name" :title="file.name">{{ file.name }}</div>
          <div class="card-meta">
            <span class="meta-type">{{ fileLibraryStore.getFileTypeLabel(file.file_type) }}</span>
            <span class="meta-date">{{ formatDate(file.created_at) }}</span>
          </div>
          <div class="card-tags" v-if="file.tags && file.tags.length">
            <span
              v-for="tag in file.tags"
              :key="tag.id"
              class="tag-chip"
              :style="{ background: tag.color || '#666' }"
            >{{ tag.name }}</span>
          </div>
        </div>
        <div class="card-actions">
          <button v-if="file.file_type === 'image' || file.file_type === 'video'" class="btn-icon-sm" @click="showFileInfo(file)" title="提示词信息">信息</button>
          <button class="btn-icon-sm" @click="editFile(file)" title="编辑">编辑</button>
          <button class="btn-icon-sm" @click="moveSingleFile(file)" title="移动">移动</button>
          <button class="btn-icon-sm danger" @click="confirmDeleteFile(file)" title="删除">删除</button>
        </div>
      </div>
    </div>

    <!-- 文件列表 - 列表视图（默认） -->
    <div class="file-list" v-if="!showRecycleBin && filteredFiles.length > 0 && viewMode === 'list'">
      <div class="list-header">
        <div class="col-check"></div>
        <div class="col-thumb">预览</div>
        <div class="col-name">名称</div>
        <div class="col-type">类型</div>
        <div class="col-tags">标签</div>
        <div class="col-date">创建时间</div>
        <div class="col-actions">操作</div>
      </div>
      <div
        v-for="file in filteredFiles"
        :key="file.id"
        :class="['list-row', { selected: selectedIds.includes(file.id) }]"
        @mouseenter="onFileMouseEnter($event, file)"
        @mouseleave="onFileMouseLeave"
        @mousemove="onFileMouseMove"
      >
        <div class="col-check" @click.stop="toggleSelect(file.id)">
          <div :class="['checkbox', { checked: selectedIds.includes(file.id) }]"></div>
        </div>
        <div class="col-thumb" @click="previewFile(file)">
          <img
            v-if="file.file_type === 'image' && thumbSrc(file)"
            :src="thumbSrc(file)"
            :alt="file.name"
          />
          <video
            v-else-if="file.file_type === 'video' && thumbSrc(file)"
            :src="thumbSrc(file)"
            muted
          ></video>
          <div v-else class="thumb-icon" :style="{ color: fileTypeColor(file.file_type) }">
            {{ fileLibraryStore.getFileTypeIcon(file.file_type) }}
          </div>
        </div>
        <div class="col-name" @click="previewFile(file)" :title="file.name">{{ file.name }}</div>
        <div class="col-type">
          <span class="type-label" :style="{ color: fileTypeColor(file.file_type) }">
            {{ fileLibraryStore.getFileTypeLabel(file.file_type) }}
          </span>
        </div>
        <div class="col-tags">
          <span
            v-for="tag in (file.tags || [])"
            :key="tag.id"
            class="tag-chip"
            :style="{ background: tag.color || '#666' }"
          >{{ tag.name }}</span>
        </div>
        <div class="col-date">{{ formatDate(file.created_at) }}</div>
        <div class="col-actions" @click.stop>
          <button v-if="file.file_type === 'image' || file.file_type === 'video'" class="btn-icon-sm" @click="showFileInfo(file)" title="提示词信息">信息</button>
          <button class="btn-icon-sm" @click="editFile(file)" title="编辑">编辑</button>
          <button class="btn-icon-sm" @click="moveSingleFile(file)" title="移动">移动</button>
          <button class="btn-icon-sm danger" @click="confirmDeleteFile(file)" title="删除">删除</button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!showRecycleBin && filteredFiles.length === 0 && fileLibraryStore.folders.length === 0" class="empty-state">
      <p v-if="searchQuery">没有找到匹配的文件</p>
      <p v-else-if="fileLibraryStore.isLoading">加载中...</p>
      <p v-else>当前位置暂无文件或文件夹，请上传或新建</p>
    </div>

    <!-- 回收站视图 -->
    <div v-if="showRecycleBin" class="recycle-bin">
      <div class="recycle-toolbar">
        <span class="recycle-count">共 {{ fileLibraryStore.recycledFiles.length + fileLibraryStore.recycledFolders.length }} 项</span>
        <button v-if="recycleSelected.files.length > 0 || recycleSelected.folders.length > 0" class="btn btn-sm" @click="batchRestore">恢复选中</button>
        <button v-if="recycleSelected.files.length > 0 || recycleSelected.folders.length > 0" class="btn btn-sm btn-danger" @click="confirmBatchPurge">彻底删除选中</button>
        <button class="btn btn-sm" @click="restoreAllConfirm">全部恢复</button>
        <button class="btn btn-sm btn-danger" @click="confirmEmptyRecycleBin">清空回收站</button>
      </div>
      <!-- 已删除文件夹 -->
      <div v-if="fileLibraryStore.recycledFolders.length > 0" class="recycle-section">
        <div class="section-header"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="vertical-align: -2px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> 文件夹 ({{ fileLibraryStore.recycledFolders.length }})</span></div>
        <div class="recycle-list">
          <div v-for="folder in fileLibraryStore.recycledFolders" :key="'f'+folder.id" class="recycle-row">
            <div class="col-check" @click.stop="toggleRecycleSelect('folder', folder.id)">
              <div :class="['checkbox', { checked: recycleSelected.folders.includes(folder.id) }]"></div>
            </div>
            <div class="recycle-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></div>
            <div class="recycle-name" :title="folder.name">{{ folder.name }}</div>
            <div class="recycle-date">{{ formatDate(folder.deleted_at) }}</div>
            <div class="recycle-actions">
              <button class="btn-icon-sm" @click="doRestoreFolder(folder.id)">恢复</button>
              <button class="btn-icon-sm danger" @click="confirmPurgeFolder(folder.id)">彻底删除</button>
            </div>
          </div>
        </div>
      </div>
      <!-- 已删除文件 -->
      <div v-if="fileLibraryStore.recycledFiles.length > 0" class="recycle-section">
        <div class="section-header"><span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="vertical-align: -2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> 文件 ({{ fileLibraryStore.recycledFiles.length }})</span></div>
        <div class="recycle-list">
          <div v-for="file in fileLibraryStore.recycledFiles" :key="'r'+file.id" class="recycle-row">
            <div class="col-check" @click.stop="toggleRecycleSelect('file', file.id)">
              <div :class="['checkbox', { checked: recycleSelected.files.includes(file.id) }]"></div>
            </div>
            <div class="recycle-icon">{{ fileLibraryStore.getFileTypeIcon(file.file_type) }}</div>
            <div class="recycle-name" :title="file.name">{{ file.name }}</div>
            <div class="recycle-date">{{ formatDate(file.deleted_at) }}</div>
            <div class="recycle-actions">
              <button class="btn-icon-sm" @click="doRestoreFile(file.id)">恢复</button>
              <button class="btn-icon-sm danger" @click="confirmPurgeFile(file.id)">彻底删除</button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="fileLibraryStore.recycledFiles.length === 0 && fileLibraryStore.recycledFolders.length === 0" class="empty-state">
        <p>回收站为空</p>
      </div>
    </div>

    <!-- 添加分类对话框 -->
    <FloatingWindow v-model:open="showAddCategory" title="添加分类" size="default">
      <div class="form-group">
        <label>分类名称</label>
        <input
          type="text"
          v-model="newCategoryName"
          placeholder="输入分类名称"
          @keyup.enter="doAddCategory"
        />
      </div>
      <template #footer>
        <button class="btn" @click="showAddCategory = false">取消</button>
        <button class="btn btn-primary" @click="doAddCategory" :disabled="!newCategoryName.trim()">添加</button>
      </template>
    </FloatingWindow>

    <!-- 重命名分类对话框 -->
    <FloatingWindow v-model:open="renamingCategoryOpen" title="重命名分类" size="default">
      <template v-if="renamingCategory">
        <div class="form-group">
          <label>新名称</label>
          <input type="text" v-model="renamingCategory.newName" @keyup.enter="doRenameCategory" />
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="renamingCategory = null">取消</button>
        <button class="btn btn-primary" @click="doRenameCategory" :disabled="!renamingCategory?.newName?.trim()">确定</button>
      </template>
    </FloatingWindow>

    <!-- 新建/重命名文件夹对话框 -->
    <FloatingWindow
      v-model:open="folderEditorOpen"
      :title="folderEditor?.mode === 'create' ? '新建文件夹' : '重命名文件夹'"
      size="default"
    >
      <template v-if="folderEditor">
        <div class="form-group">
          <label>文件夹名称</label>
          <input
            type="text"
            v-model="folderEditor.name"
            placeholder="输入文件夹名称"
            @keyup.enter="doSaveFolder"
          />
        </div>
        <div class="form-group" v-if="folderEditor.mode === 'create'">
          <label>
            <input type="checkbox" v-model="folderEditor.is_callable" />
            设为可调用文件夹（供任务/角色设置引用）
          </label>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="folderEditor = null">取消</button>
        <button class="btn btn-primary" @click="doSaveFolder" :disabled="!folderEditor?.name?.trim()">保存</button>
      </template>
    </FloatingWindow>

    <!-- 文件编辑对话框（按文件类型区分编辑面板） -->
    <FloatingWindow
      v-model:open="editingFileOpen"
      :title="`${editingFile?.id ? '编辑' : '新建'}${fileTypeLabel(editingFile?.file_type)}`"
      :size="editingFile?.file_type === 'workflow' ? 'xlarge' : 'large'"
    >
      <template v-if="editingFile">
        <div class="form-group">
          <label>名称</label>
          <input type="text" v-model="editingFile.name" />
        </div>

        <!-- 提示词编辑器：支持纯文本/MD/JSON 代码 -->
        <div class="form-group" v-if="editingFile.file_type === 'prompt'">
          <label>提示词内容（支持纯文本 / Markdown / JSON 代码）</label>
          <textarea
            v-model="editingFile.content"
            rows="14"
            class="content-editor"
            spellcheck="false"
            placeholder="可输入纯文本、Markdown 格式内容，或粘贴 JSON 代码"
          ></textarea>
          <div class="editor-info">
            <span>字符数：{{ editingFile.content?.length || 0 }}</span>
            <span v-if="isContentJson" class="valid-badge valid">· 检测到 JSON 格式</span>
          </div>
        </div>

        <!-- JSON 编辑器：等宽字体 + JSON 校验 -->
        <div class="form-group" v-else-if="editingFile.file_type === 'json'">
          <label>JSON 内容</label>
          <textarea
            v-model="editingFile.content"
            rows="16"
            class="content-editor json-editor"
            spellcheck="false"
          ></textarea>
          <div class="editor-info">
            <span :class="['valid-badge', { valid: editingFile.jsonValid, invalid: !editingFile.jsonValid }]">
              {{ editingFile.jsonValid ? '✓ JSON 格式正确' : '✗ JSON 格式错误' }}
            </span>
            <span v-if="editingFile.jsonValid && editingFile.jsonData?.length !== undefined">
              · 分镜数：{{ editingFile.jsonData.length }}
            </span>
          </div>
        </div>

        <!-- 工作流编辑器：左右分栏（节点列表 + 属性编辑） -->
        <div class="form-group" v-else-if="editingFile.file_type === 'workflow'">
          <label>工作流节点编辑（ComfyUI 导出格式）</label>
          <div v-if="editingFile.workflowError" class="dialog-error">{{ editingFile.workflowError }}</div>
          <div v-else class="workflow-editor-layout">
            <div class="editor-left">
              <div class="node-list">
                <div
                  v-for="(node, id) in editingFile.workflowData"
                  :key="id"
                  :class="['node-item', { active: editingFile.selectedNodeId === id }]"
                  @click="selectWorkflowNode(id)"
                >
                  <span class="node-id">{{ id }}</span>
                  <span class="node-type">{{ node.class_type }}</span>
                </div>
              </div>
            </div>
            <div class="editor-right">
              <div v-if="selectedWorkflowNode" class="edit-panel">
                <div class="node-id-container">
                  <span>节点ID：<strong>{{ editingFile.selectedNodeId }}</strong></span>
                  <span class="node-class">类型：{{ selectedWorkflowNode.class_type }}</span>
                </div>
                <div class="form-group">
                  <label>属性名称</label>
                  <select v-model="editingFile.editNodeProperty" @change="onWorkflowPropertyChange">
                    <option value="" disabled>请选择属性</option>
                    <option v-for="prop in editableWorkflowNodeProps" :key="prop.key" :value="prop.key">
                      {{ prop.key }} ({{ formatPreview(prop.value) }})
                    </option>
                  </select>
                </div>
                <div class="form-group">
                  <label>属性值</label>
                  <textarea v-model="editingFile.editNodeValue" rows="6" class="content-editor"></textarea>
                </div>
                <button class="btn btn-sm btn-primary" @click="doUpdateWorkflowNode">更新节点</button>
                <p v-if="editingFile.editMessage" class="edit-message">{{ editingFile.editMessage }}</p>
              </div>
              <div v-else class="empty-hint">
                <p>请从左侧选择一个节点进行编辑</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 规则编辑器 -->
        <div class="form-group" v-else-if="editingFile.file_type === 'rule'">
          <label>规则内容</label>
          <textarea
            v-model="editingFile.content"
            rows="14"
            class="content-editor"
            spellcheck="false"
          ></textarea>
        </div>

        <!-- 媒体预览（图片/视频/音频） -->
        <div class="form-group" v-else-if="editingFile.file_type === 'image'">
          <label>预览</label>
          <div class="image-preview-box">
            <img v-if="editingFile.previewSrc" :src="editingFile.previewSrc" :alt="editingFile.name" />
            <div v-else class="preview-placeholder">加载预览中...</div>
          </div>
          <button class="btn btn-sm" @click="triggerReplaceImage">替换图片</button>
          <input
            type="file"
            ref="replaceImageInput"
            accept="image/*"
            @change="handleReplaceImage"
            style="display: none"
          />
        </div>
        <div class="form-group" v-else-if="editingFile.file_type === 'video' || editingFile.file_type === 'audio'">
          <label>预览</label>
          <div class="image-preview-box">
            <video v-if="editingFile.previewSrc" :src="editingFile.previewSrc" controls></video>
            <audio v-else-if="editingFile.file_type === 'audio' && editingFile.previewSrc" :src="editingFile.previewSrc" controls></audio>
            <div v-else class="preview-placeholder">加载预览中...</div>
          </div>
        </div>
        <div class="form-group">
          <label>标签</label>
          <div class="tag-selector">
            <span
              v-for="tag in fileLibraryStore.tags"
              :key="tag.id"
              :class="['tag-option', { selected: editingFile.selectedTags.includes(tag.id) }]"
              :style="{ background: editingFile.selectedTags.includes(tag.id) ? (tag.color || '#666') : 'transparent', borderColor: tag.color || '#666' }"
              @click="toggleEditorTag(tag.id)"
            >{{ tag.name }}</span>
          </div>
        </div>
        <div v-if="editorErrorMessage" class="dialog-error">{{ editorErrorMessage }}</div>
      </template>
      <template #footer>
        <button class="btn" @click="closeEditor">取消</button>
        <button class="btn btn-primary" @click="doSaveFile" :disabled="!editingFile?.name?.trim()">保存</button>
      </template>
    </FloatingWindow>

    <!-- ============ JSON 分镜编辑器（新建+编辑） ============ -->
    <FloatingWindow
      v-model:open="jsonStoryboardEditorOpen"
      :title="`${jsonStoryboardEditor.id ? '编辑' : '新建'}JSON分镜`"
      size="large"
    >
      <div class="form-group">
        <label>名称</label>
        <input type="text" v-model="jsonStoryboardEditor.name" placeholder="输入名称（保存为 JSON 文件名）" />
      </div>
      <div class="form-group">
        <label>TXT 内容</label>
        <textarea
          v-model="jsonStoryboardEditor.testText"
          rows="10"
          class="content-editor"
          spellcheck="false"
          placeholder="粘贴 TXT 内容..."
        ></textarea>
      </div>
      <div class="form-group json-storyboard-actions">
        <button type="button" class="btn btn-sm btn-primary" @click="testJsonStoryboardParser">测试解析</button>
        <span v-if="jsonStoryboardEditor.parseResult" class="parse-result-info">
          解析到 {{ jsonStoryboardEditor.parseResult.length }} 条分镜
        </span>
      </div>
      <div v-if="jsonStoryboardEditor.parseResult && jsonStoryboardEditor.parseResult.length > 0" class="parse-result-preview">
        <div v-for="(item, idx) in jsonStoryboardEditor.parseResult.slice(0, 3)" :key="idx" class="parse-result-item">
          <strong>分镜 {{ idx + 1 }}</strong>
          <pre>{{ JSON.stringify(item, null, 2) }}</pre>
        </div>
        <p v-if="jsonStoryboardEditor.parseResult.length > 3" class="parse-more">...共 {{ jsonStoryboardEditor.parseResult.length }} 条</p>
      </div>
      <div v-if="jsonStoryboardEditor.errorMessage" class="dialog-error">{{ jsonStoryboardEditor.errorMessage }}</div>
      <div v-if="jsonStoryboardEditor.successMessage" class="edit-message">{{ jsonStoryboardEditor.successMessage }}</div>
      <template #footer>
        <button class="btn" @click="closeJsonStoryboardEditor">取消</button>
        <button
          class="btn btn-primary"
          @click="saveJsonStoryboardFile"
          :disabled="!jsonStoryboardEditor.parseResult || jsonStoryboardEditor.parseResult.length === 0 || !jsonStoryboardEditor.name.trim()"
        >保存</button>
      </template>
    </FloatingWindow>

    <!-- ============ 批量提示词编辑器（新建+编辑JSON） ============ -->
    <FloatingWindow
      v-model:open="batchPromptsEditorOpen"
      :title="`${batchPromptsEditor.id ? '编辑' : '新建'}批量提示词（${batchPromptsEditor.prompts.length}）`"
      size="large"
    >
      <div class="batch-prompts-toolbar">
        <button type="button" class="btn btn-sm btn-primary batch-add-btn" @click="addBatchPromptItem" title="增加一个提示词">+</button>
        <input
          type="text"
          v-model="batchPromptsEditor.name"
          placeholder="输入名称（保存为 JSON 文件名）"
          class="batch-name-input"
        />
        <button
          type="button"
          class="btn btn-sm btn-primary"
          @click="saveBatchPromptsFile"
          :disabled="!batchPromptsEditor.name.trim()"
        >保存并且应用</button>
        <button type="button" class="btn btn-sm" @click="batchClearConfirm = true">清空</button>
      </div>
      <div class="batch-prompts-list">
        <div v-for="(prompt, idx) in batchPromptsDisplay" :key="prompt.id" class="form-group batch-prompt-group">
          <label>提示词（{{ idx + 1 }}）</label>
          <div class="batch-prompt-wrapper">
            <textarea
              v-model="prompt.content"
              class="content-editor batch-content-editor"
              spellcheck="false"
              placeholder="粘贴提示词内容..."
              style="width: calc(100% - 38px); height: 120px; min-height: 0; box-shadow: none;"
            ></textarea>
            <button
              type="button"
              class="batch-prompt-delete"
              @click="removeBatchPromptItem(prompt.id)"
              title="删除此提示词"
            >×</button>
          </div>
        </div>
      </div>
      <div v-if="batchPromptsEditor.errorMessage" class="dialog-error">{{ batchPromptsEditor.errorMessage }}</div>
      <div v-if="batchPromptsEditor.successMessage" class="edit-message">{{ batchPromptsEditor.successMessage }}</div>
    </FloatingWindow>

    <!-- 批量提示词清空确认弹窗 -->
    <FloatingWindow v-model:open="batchClearConfirm" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要清空所有提示词吗？此操作不可撤销。</p>
      <template #footer>
        <button class="btn" @click="batchClearConfirm = false">取消</button>
        <button class="btn btn-danger" @click="doClearBatchPromptsEditor">确定清空</button>
      </template>
    </FloatingWindow>

    <!-- 移动文件对话框（单个/批量） -->
    <FloatingWindow
      v-model:open="moveTargetOpen"
      :title="`移动 ${moveTarget?.ids?.length || 0} 个文件`"
      size="default"
    >
      <template v-if="moveTarget">
        <div class="form-group">
          <label>目标分类</label>
          <select v-model="moveTarget.categoryId" @change="onMoveCategoryChange">
            <option v-for="cat in fileLibraryStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>目标文件夹（留空表示分类根目录）</label>
          <select v-model="moveTarget.folderId">
            <option :value="null">（分类根目录）</option>
            <option v-for="f in moveTarget.folders" :key="f.id" :value="f.id">{{ '　'.repeat(f.depth) + '├ ' + f.name }}</option>
          </select>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="moveTarget = null">取消</button>
        <button class="btn btn-primary" @click="doMoveFiles" :disabled="!moveTarget?.categoryId">确定</button>
      </template>
    </FloatingWindow>

    <!-- 文件夹批量移动对话框 -->
    <FloatingWindow
      v-model:open="folderMoveTargetOpen"
      :title="`移动 ${folderMoveTarget?.ids?.length || 0} 个文件夹`"
      size="default"
    >
      <template v-if="folderMoveTarget">
        <div class="form-group">
          <label>目标分类</label>
          <select v-model="folderMoveTarget.categoryId" @change="onFolderMoveCategoryChange">
            <option v-for="cat in fileLibraryStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>目标父文件夹（留空表示分类根目录）</label>
          <select v-model="folderMoveTarget.parentId">
            <option :value="null">（分类根目录）</option>
            <option v-for="f in folderMoveTarget.folders" :key="f.id" :value="f.id">{{ '　'.repeat(f.depth) + '├ ' + f.name }}</option>
          </select>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="folderMoveTarget = null">取消</button>
        <button class="btn btn-primary" @click="doMoveFolders" :disabled="!folderMoveTarget?.categoryId">确定</button>
      </template>
    </FloatingWindow>

    <!-- 批量打标签对话框 -->
    <FloatingWindow
      v-model:open="batchTagModalOpen"
      :title="`为 ${batchTagModal?.ids?.length || 0} 个文件打标签`"
      size="default"
    >
      <template v-if="batchTagModal">
        <div class="form-group">
          <label>选择标签</label>
          <div class="tag-selector">
            <span
              v-for="tag in fileLibraryStore.tags"
              :key="tag.id"
              :class="['tag-option', { selected: batchTagModal.tagIds.includes(tag.id) }]"
              :style="{ background: batchTagModal.tagIds.includes(tag.id) ? (tag.color || '#666') : 'transparent', borderColor: tag.color || '#666' }"
              @click="toggleBatchTag(tag.id)"
            >{{ tag.name }}</span>
            <span v-if="fileLibraryStore.tags.length === 0" class="empty-hint">暂无标签，请先在标签管理中创建</span>
          </div>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="batchTagModal = null">取消</button>
        <button class="btn btn-primary" @click="doBatchTag" :disabled="(batchTagModal?.tagIds?.length || 0) === 0">确定</button>
      </template>
    </FloatingWindow>

    <!-- 单张图片上传方式选择 -->
    <FloatingWindow v-model:open="showUploadChoiceOpen" title="选择上传方式" size="default">
      <p class="upload-hint">请选择图片的上传方式：</p>
      <div class="choice-buttons">
        <button class="choice-btn" @click="chooseWholeUpload">
          <span class="choice-icon">⬜</span>
          <span class="choice-title">整张上传</span>
          <span class="choice-desc">保留原图，不裁切</span>
        </button>
        <button class="choice-btn" @click="chooseCropUpload">
          <span class="choice-icon">✂️</span>
          <span class="choice-title">裁切上传</span>
          <span class="choice-desc">按比例裁切后上传</span>
        </button>
      </div>
      <template #footer>
        <button class="btn btn-sm" @click="cancelUploadChoice">取消</button>
      </template>
    </FloatingWindow>

    <!-- 图片裁切对话框（共用 ImageCropper 组件） -->
    <ImageCropper
      :visible="showCropper"
      :image-src="pendingImageBase64"
      @confirm="onCropConfirm"
      @cancel="onCropCancel"
    />

    <!-- 删除确认对话框 -->
    <FloatingWindow v-model:open="deleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">{{ deleteConfirm.message }}</p>
      <template #footer>
        <button class="btn" @click="deleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDelete">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 大图预览 -->
    <ImageViewer v-model:visible="viewerVisible" :src="viewerSrc" :images="viewerImages" :prompts="viewerPrompts" :currentIndex="viewerCurrentIndex" @prev="onViewerPrev" @next="onViewerNext" />

    <!-- 文件内容 hover 预览 -->
    <Teleport to="body">
      <div
        v-if="contentTipVisible && contentTipText"
        class="fl-content-tip"
        :style="contentTipStyle"
      >
        <pre class="fl-content-text">{{ contentTipText }}</pre>
      </div>
    </Teleport>

    <!-- 图片/视频提示词信息弹窗 -->
    <FloatingWindow v-model:open="fileInfoOpen" title="提示词信息" size="large">
      <template v-if="fileInfoTarget">
        <div class="file-info-modal-header">
          <h4>{{ fileInfoTarget.name || '未命名' }}</h4>
        </div>
        <div class="file-info-modal-content">
          <div class="file-info-item">
            <strong>提示词:</strong>
            <div class="file-info-prompt-wrap">
              <textarea readonly :value="fileInfoLoading ? '加载中…' : (fileInfoText || '无提示词')"></textarea>
            </div>
            <div class="file-info-copy-container">
              <button @click.prevent="copyFileInfoPrompt" class="file-info-copy-btn">
                {{ fileInfoCopyStatus }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useFileLibraryStore, FILE_TYPES } from '@/stores/fileLibrary'
import { useConfigStore } from '@/stores/config'
import { parseStoryboardWithConfig, buildPromptFromTemplate } from '@/utils/storyboardParser'
import { onEditFile } from '@/utils/fileEditBus'
import { useDropTarget } from '@/composables/useDragDrop'
import apiClient from '@/services/api'
import ImageViewer from '@/components/ui/ImageViewer.vue'
import ImageCropper from '@/components/common/ImageCropper.vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const emit = defineEmits(['navigate'])

const fileLibraryStore = useFileLibraryStore()
const configStore = useConfigStore()

// 视图与筛选状态
const viewMode = ref('list')
const searchQuery = ref('')
const filterType = ref('all')
const selectedIds = ref([])
// 上传区域显示/隐藏
const showUploadZone = ref(false)

// 上传相关
const isDragOver = ref(false)
const fileInput = ref(null)
const replaceImageInput = ref(null)

// TXT 转批量分镜 JSON
const isTxtDragOver = ref(false)
const txtFileInput = ref(null)
const convertProgress = ref([])
const isConverting = ref(false)

// 编辑器错误信息
const editorErrorMessage = ref('')

// 分类对话框
const showAddCategory = ref(false)
const newCategoryName = ref('')
const renamingCategory = ref(null)

// 文件夹编辑器
const folderEditor = ref(null)

// 文件编辑器
const editingFile = ref(null)

// ============ JSON 分镜编辑器 ============
const jsonStoryboardEditor = reactive({
  id: null,
  name: '',
  testText: '',
  parseResult: null,
  errorMessage: '',
  successMessage: ''
})
const jsonStoryboardEditorOpen = ref(false)
const jsonStoryboardEditorIdCounter = ref(1)

// ============ 批量提示词编辑器（新建+编辑JSON） ============
const batchPromptsEditor = reactive({
  id: null,
  name: '',
  prompts: [{ id: 1, content: '' }],
  nextId: 2,
  errorMessage: '',
  successMessage: ''
})
const batchPromptsEditorOpen = ref(false)
const batchClearConfirm = ref(false)

// 显示用倒序（最新的在上面）
const batchPromptsDisplay = computed(() => [...batchPromptsEditor.prompts].reverse())

// 系统分类与自定义分类
const systemCategories = computed(() => {
  const list = fileLibraryStore.categories.filter(c => c.is_system)
  // 确保 "总库" 在 "UI库" 前面
  return list.sort((a, b) => {
    if (a.name === '总库') return -1
    if (b.name === '总库') return 1
    if (a.name === 'UI库') return -1
    if (b.name === 'UI库') return 1
    return 0
  })
})
const customCategories = computed(() => fileLibraryStore.categories.filter(c => !c.is_system))

// 移动文件
const moveTarget = ref(null)

// 批量打标签
const batchTagModal = ref(null)

// 标签筛选（多选）
const showTagFilter = ref(false)
const selectedTagFilters = ref([])
const hoveredTagFilter = ref(null)

// 文件夹批量选择
const selectedFolderIds = ref([])
// 文件夹批量移动弹窗
const folderMoveTarget = ref(null)

// 监听 store 数据变化，自动清理无效的选中项（处理单个删除/移动等操作后选中项未更新的问题）
watch(() => fileLibraryStore.files, () => {
  if (selectedIds.value.length > 0) {
    const validIds = new Set(fileLibraryStore.files.map(f => f.id))
    selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
  }
}, { deep: true })
watch(() => fileLibraryStore.folders, () => {
  if (selectedFolderIds.value.length > 0) {
    const validIds = new Set(fileLibraryStore.folders.map(f => f.id))
    selectedFolderIds.value = selectedFolderIds.value.filter(id => validIds.has(id))
  }
}, { deep: true })

// 回收站
const showRecycleBin = ref(false)
const recycleSelected = ref({ files: [], folders: [] })

// 删除确认
const deleteConfirm = ref({ show: false, type: '', target: null, message: '' })

// 大图预览
const viewerVisible = ref(false)
const viewerSrc = ref('')
const viewerCurrentIndex = ref(-1)
// 当前目录下的图片/视频文件列表（用于上一张/下一张导航）
const viewerImages = computed(() =>
  fileLibraryStore.files.filter(f => f.file_type === 'image' || f.file_type === 'video')
)
// 与 viewerImages 顺序对应的提示词列表（取文件描述作为提示词）
const viewerPrompts = computed(() =>
  viewerImages.value.map(f => f.description || '')
)

// ============================================
// 浮动窗口可见性代理（v-model:open 需要布尔值，原状态可能是对象引用）
// ============================================
const renamingCategoryOpen = computed({
  get: () => !!renamingCategory.value,
  set: (v) => { if (!v) renamingCategory.value = null }
})
const folderEditorOpen = computed({
  get: () => !!folderEditor.value,
  set: (v) => { if (!v) folderEditor.value = null }
})
const editingFileOpen = computed({
  get: () => !!editingFile.value,
  set: (v) => { if (!v) closeEditor() }
})
const moveTargetOpen = computed({
  get: () => !!moveTarget.value,
  set: (v) => { if (!v) moveTarget.value = null }
})
const folderMoveTargetOpen = computed({
  get: () => !!folderMoveTarget.value,
  set: (v) => { if (!v) folderMoveTarget.value = null }
})
const batchTagModalOpen = computed({
  get: () => !!batchTagModal.value,
  set: (v) => { if (!v) batchTagModal.value = null }
})
const showUploadChoiceOpen = computed({
  get: () => showUploadChoice.value,
  set: (v) => { if (!v) cancelUploadChoice() }
})
const deleteConfirmOpen = computed({
  get: () => deleteConfirm.value.show,
  set: (v) => { if (!v) deleteConfirm.value.show = false }
})

// ============================================
// 计算属性
// ============================================

const uploadTargetLabel = computed(() => {
  const cat = fileLibraryStore.categories.find(c => c.id === fileLibraryStore.currentCategoryId)
  if (!cat) return '未选择分类'
  const folder = fileLibraryStore.breadcrumb.find(b => b.type === 'folder')
  return folder ? `${cat.name} / ${folder.name}` : cat.name
})

// TXT 转换进度统计
const txtSuccessCount = computed(() => convertProgress.value.filter(i => i.status === 'success').length)
const txtFailCount = computed(() => convertProgress.value.filter(i => i.status === 'fail').length)

// 提示词内容是否为 JSON 格式
const isContentJson = computed(() => {
  if (!editingFile.value || editingFile.value.file_type !== 'prompt') return false
  const text = (editingFile.value.content || '').trim()
  if (!text) return false
  try { JSON.parse(text); return true } catch { return false }
})

// 工作流：当前选中节点
const selectedWorkflowNode = computed(() => {
  if (!editingFile.value?.workflowData || !editingFile.value.selectedNodeId) return null
  return editingFile.value.workflowData[editingFile.value.selectedNodeId] || null
})

// 工作流：当前选中节点可编辑属性（过滤掉数组类型，即连接关系）
const editableWorkflowNodeProps = computed(() => {
  const node = selectedWorkflowNode.value
  if (!node?.inputs) return []
  return Object.entries(node.inputs)
    .filter(([, value]) => !Array.isArray(value))
    .map(([key, value]) => ({ key, value }))
})

const filteredFiles = computed(() => {
  let list = fileLibraryStore.files
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(f => f.name?.toLowerCase().includes(q))
  }
  if (selectedTagFilters.value.length > 0) {
    list = list.filter(f => {
      const tagIds = (f.tags || []).map(t => t.id)
      return selectedTagFilters.value.every(id => tagIds.includes(id))
    })
  }
  return list
})

// ---- 缩略图兜底 ----
// 很多图片记录没有 thumbnail_data（原图已移走或迁移时未写入），
// 这里回退取磁盘原图 blob，让"小图"重新显示出来。
const thumbCache = reactive({})
const thumbPending = new Set()

function thumbSrc(file) {
  if (!file) return ''
  if (file.file_type !== 'image' && file.file_type !== 'video') return ''
  if (file.thumbnail_data) return file.thumbnail_data
  return thumbCache[file.id] || ''
}

async function ensureThumbs(list) {
  const need = list
    .filter(f => (f.file_type === 'image' || f.file_type === 'video') && !f.thumbnail_data && !thumbCache[f.id])
    .slice(0, 120)
  for (const f of need) {
    if (thumbPending.has(f.id)) continue
    thumbPending.add(f.id)
    try {
      const url = await apiClient.getFileLibraryFileBlobUrl(f.id)
      if (url) thumbCache[f.id] = url
    } catch { /* 原图已移走则保持无缩略图 */ }
    thumbPending.delete(f.id)
  }
}
watch(() => filteredFiles.value, (list) => { ensureThumbs(list || []) }, { immediate: true })

// 标签筛选辅助函数
function getTagName(id) {
  return fileLibraryStore.tags.find(t => t.id === id)?.name || '未知'
}
function getTagColor(id) {
  return fileLibraryStore.tags.find(t => t.id === id)?.color || '#666'
}
function toggleTagFilter(id) {
  const i = selectedTagFilters.value.indexOf(id)
  if (i > -1) selectedTagFilters.value.splice(i, 1)
  else selectedTagFilters.value.push(id)
}
function removeTagFilter(id) {
  selectedTagFilters.value = selectedTagFilters.value.filter(x => x !== id)
}

const allSelected = computed(() => {
  return filteredFiles.value.length > 0 &&
    filteredFiles.value.every(f => selectedIds.value.includes(f.id))
})

const allFolderSelected = computed(() => {
  return (fileLibraryStore.folders.length === 0 ||
    fileLibraryStore.folders.every(f => selectedFolderIds.value.includes(f.id)))
})

const currentCategoryFileCount = computed(() => {
  const cat = fileLibraryStore.categories.find(c => c.id === fileLibraryStore.currentCategoryId)
  return cat ? (cat.file_count ?? 0) : 0
})

// ============================================
// 工具函数
// ============================================

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function fileTypeColor(type) {
  return FILE_TYPES[type]?.color || '#888'
}

// ============================================
// 选择
// ============================================

function toggleSelect(id) {
  const i = selectedIds.value.indexOf(id)
  if (i > -1) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAll() {
  const allEverythingSelected = allSelected.value && allFolderSelected.value
  if (allEverythingSelected) {
    selectedIds.value = selectedIds.value.filter(
      id => !filteredFiles.value.some(f => f.id === id)
    )
    selectedFolderIds.value = selectedFolderIds.value.filter(
      id => !fileLibraryStore.folders.some(f => f.id === id)
    )
  } else {
    filteredFiles.value.forEach(f => {
      if (!selectedIds.value.includes(f.id)) selectedIds.value.push(f.id)
    })
    fileLibraryStore.folders.forEach(f => {
      if (!selectedFolderIds.value.includes(f.id)) selectedFolderIds.value.push(f.id)
    })
  }
}

// ============================================
// 上传
// ============================================

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileSelect(event) {
  const files = Array.from(event.target.files || [])
  await doUpload(files)
  event.target.value = ''
}

async function handleDrop(event) {
  isDragOver.value = false
  const files = Array.from(event.dataTransfer.files).filter(f => {
    const name = f.name.toLowerCase()
    return f.type.startsWith('image/') || f.type.startsWith('video/') ||
      f.type.startsWith('audio/') || name.endsWith('.json') ||
      name.endsWith('.txt') || name.endsWith('.md')
  })
  await doUpload(files)
}

// ============================================
// TXT 转批量分镜 JSON
// ============================================

function triggerTxtFileInput() {
  txtFileInput.value?.click()
}

async function handleTxtFileSelect(event) {
  const files = Array.from(event.target.files || []).filter(f => f.name.toLowerCase().endsWith('.txt'))
  await convertTxtFiles(files)
  event.target.value = ''
}

async function handleTxtDrop(event) {
  isTxtDragOver.value = false
  const files = Array.from(event.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.txt'))
  await convertTxtFiles(files)
}

// 解析分镜文本（基于设置面板中的"分镜解析"配置）
// 支持多种格式：分镜N. / ### 分镜N / -- 分镜N / "1. 视角：" 紧凑单行格式
// 配置可在 设置 → 分镜解析 中自定义
function parseStoryboard(content) {
  const cfg = configStore.storyboardParser
  return parseStoryboardWithConfig(content, cfg)
}

function generatePrompt(storyboard) {
  const cfg = configStore.storyboardParser
  if (storyboard.content) {
    return storyboard.content
  }
  return buildPromptFromTemplate(storyboard, cfg?.promptTemplate)
}

async function convertTxtFiles(files) {
  if (files.length === 0) return
  if (!fileLibraryStore.currentCategoryId) {
    alert('请先选择一个分类')
    return
  }
  isConverting.value = true
  convertProgress.value = files.map(f => ({ name: f.name, status: 'pending', message: '' }))

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    try {
      const text = await file.text()
      let storyboards
      try {
        storyboards = parseStoryboard(text)
      } catch (parseErr) {
        convertProgress.value[i].status = 'fail'
        convertProgress.value[i].message = '解析失败'
        continue
      }

      const prompts = storyboards.map(sb => ({ id: sb.id, prompt: generatePrompt(sb) }))
      if (prompts.length === 0) {
        convertProgress.value[i].status = 'fail'
        convertProgress.value[i].message = '未识别到分镜'
        continue
      }

      try {
        await fileLibraryStore.createFile({
          category_id: fileLibraryStore.currentCategoryId,
          folder_id: fileLibraryStore.currentFolderId,
          name: file.name.replace(/\.txt$/i, ''),
          file_type: 'json',
          filename: file.name,
          content: JSON.stringify(prompts, null, 2),
          prompt_count: prompts.length,
          is_valid: 1
        })
        convertProgress.value[i].status = 'success'
      } catch (createErr) {
        convertProgress.value[i].status = 'fail'
        convertProgress.value[i].message = createErr.message || '写入失败'
      }
    } catch (e) {
      convertProgress.value[i].status = 'fail'
      convertProgress.value[i].message = e.message || '读取失败'
    }
  }

  isConverting.value = false
  await reloadCurrent()
}

// 单张图片上传：选择对话框 / 裁切（使用共用 ImageCropper 组件）
const showUploadChoice = ref(false)
const showCropper = ref(false)
const pendingImageBase64 = ref('')
const pendingImageFile = ref(null)

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function doUpload(files) {
  if (files.length === 0) return
  if (!fileLibraryStore.currentCategoryId) {
    alert('请先选择一个分类')
    return
  }
  // 单张图片：提供整张/裁切选择
  if (files.length === 1 && files[0].type.startsWith('image/')) {
    pendingImageFile.value = files[0]
    pendingImageBase64.value = await fileToBase64(files[0])
    showUploadChoice.value = true
    return
  }
  await performUpload(files)
}

async function performUpload(files) {
  try {
    await fileLibraryStore.uploadFiles(files)
    await reloadCurrent()
  } catch (e) {
    alert('上传失败：' + (e.message || e))
  }
}

function cancelUploadChoice() {
  showUploadChoice.value = false
  pendingImageBase64.value = ''
  pendingImageFile.value = null
}

async function chooseWholeUpload() {
  showUploadChoice.value = false
  if (pendingImageFile.value) {
    await performUpload([pendingImageFile.value])
  }
  cancelUploadChoice()
}

function chooseCropUpload() {
  showUploadChoice.value = false
  showCropper.value = true
}

// ImageCropper 确认裁切 → 转为 File 上传
async function onCropConfirm(base64) {
  showCropper.value = false
  const name = (pendingImageFile.value?.name || 'image').replace(/\.[^.]+$/, '') + '_crop.png'
  const blob = base64ToBlob(base64)
  const file = new File([blob], name, { type: 'image/png' })
  await performUpload([file])
  cancelUploadChoice()
}

function onCropCancel() {
  showCropper.value = false
  cancelUploadChoice()
}

function base64ToBlob(base64) {
  const arr = base64.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) u8arr[n] = bstr.charCodeAt(n)
  return new Blob([u8arr], { type: mime })
}

async function reloadCurrent() {
  await Promise.all([
    fileLibraryStore.loadFolders(
      fileLibraryStore.currentCategoryId,
      fileLibraryStore.currentFolderId
    ),
    fileLibraryStore.loadFiles(
      fileLibraryStore.currentCategoryId,
      fileLibraryStore.currentFolderId,
      filterType.value
    )
  ])
  // 清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
  if (selectedIds.value.length > 0) {
    const validIds = new Set(fileLibraryStore.files.map(f => f.id))
    selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
  }
  if (selectedFolderIds.value.length > 0) {
    const validFolderIds = new Set(fileLibraryStore.folders.map(f => f.id))
    selectedFolderIds.value = selectedFolderIds.value.filter(id => validFolderIds.has(id))
  }
}

// ============================================
// 分类操作
// ============================================

async function doAddCategory() {
  if (!newCategoryName.value.trim()) return
  try {
    await fileLibraryStore.createCategory(newCategoryName.value.trim())
    newCategoryName.value = ''
    showAddCategory.value = false
  } catch (e) {
    alert('添加分类失败：' + (e.message || e))
  }
}

function renameCategory(cat) {
  renamingCategory.value = { id: cat.id, newName: cat.name }
}

async function doRenameCategory() {
  if (!renamingCategory.value || !renamingCategory.value.newName?.trim()) return
  try {
    await fileLibraryStore.updateCategory(renamingCategory.value.id, {
      name: renamingCategory.value.newName.trim()
    })
    renamingCategory.value = null
  } catch (e) {
    alert('重命名失败：' + (e.message || e))
  }
}

function confirmDeleteCategory(cat) {
  deleteConfirm.value = {
    show: true,
    type: 'category',
    target: cat,
    message: `确定删除分类"${cat.name}"吗？\n若分类下有内容将无法删除（会提示错误）。`
  }
}

// ============================================
// 文件夹操作
// ============================================

function openNewFolder() {
  if (!fileLibraryStore.currentCategoryId) {
    alert('请先选择一个分类')
    return
  }
  folderEditor.value = {
    mode: 'create',
    name: '',
    is_callable: false
  }
}

function renameFolder(folder) {
  folderEditor.value = {
    mode: 'rename',
    id: folder.id,
    name: folder.name,
    is_callable: folder.is_callable
  }
}

async function doSaveFolder() {
  if (!folderEditor.value || !folderEditor.value.name?.trim()) return
  try {
    if (folderEditor.value.mode === 'create') {
      await fileLibraryStore.createFolder({
        category_id: fileLibraryStore.currentCategoryId,
        parent_id: fileLibraryStore.currentFolderId,
        name: folderEditor.value.name.trim(),
        is_callable: folderEditor.value.is_callable
      })
    } else {
      await fileLibraryStore.updateFolder(folderEditor.value.id, {
        name: folderEditor.value.name.trim()
      })
    }
    folderEditor.value = null
    await fileLibraryStore.loadFolders(
      fileLibraryStore.currentCategoryId,
      fileLibraryStore.currentFolderId
    )
  } catch (e) {
    alert('保存文件夹失败：' + (e.message || e))
  }
}

async function toggleCallable(folder) {
  try {
    const newVal = !folder.is_callable
    const result = await fileLibraryStore.updateFolder(folder.id, {
      is_callable: newVal ? 1 : 0
    })
    if (!result) {
      alert('切换可调用状态失败，请检查后端是否已重启')
    } else {
      await reloadCurrent()
    }
  } catch (e) {
    alert('切换可调用状态失败：' + (e.message || e))
  }
}

function confirmDeleteFolder(folder) {
  deleteConfirm.value = {
    show: true,
    type: 'folder',
    target: folder,
    message: `确定删除文件夹"${folder.name}"吗？\n文件夹及其所有内容将移入回收站。`
  }
}

// ============================================
// 文件夹批量选择/删除/移动
// ============================================

function toggleSelectFolder(id) {
  const i = selectedFolderIds.value.indexOf(id)
  if (i > -1) selectedFolderIds.value.splice(i, 1)
  else selectedFolderIds.value.push(id)
}

function confirmBatchDeleteFolders() {
  if (selectedFolderIds.value.length === 0) return
  deleteConfirm.value = {
    show: true,
    type: 'batchFolders',
    target: null,
    message: `确定删除选中的 ${selectedFolderIds.value.length} 个文件夹吗？\n文件夹及其所有内容将移入回收站。`
  }
}

function openBatchMoveFolders() {
  if (selectedFolderIds.value.length === 0) return
  folderMoveTarget.value = {
    ids: [...selectedFolderIds.value],
    categoryId: fileLibraryStore.currentCategoryId,
    parentId: null,
    folders: []
  }
  if (folderMoveTarget.value.categoryId) loadFolderMoveFolders(folderMoveTarget.value.categoryId)
}

async function loadFolderMoveFolders(categoryId) {
  try {
    const list = await apiClient.getFileLibraryFolders({ category_id: categoryId, parent_id: 'all' })
    folderMoveTarget.value.folders = buildFolderTree(list || [])
  } catch (e) {
    folderMoveTarget.value.folders = []
  }
}

function onFolderMoveCategoryChange() {
  folderMoveTarget.value.parentId = null
  loadFolderMoveFolders(folderMoveTarget.value.categoryId)
}

async function doMoveFolders() {
  if (!folderMoveTarget.value || !folderMoveTarget.value.categoryId) return
  try {
    await fileLibraryStore.batchMoveFolders(
      folderMoveTarget.value.ids,
      folderMoveTarget.value.categoryId,
      folderMoveTarget.value.parentId
    )
    selectedFolderIds.value = selectedFolderIds.value.filter(
      id => !folderMoveTarget.value.ids.includes(id)
    )
    folderMoveTarget.value = null
    await fileLibraryStore.loadFolders(
      fileLibraryStore.currentCategoryId,
      fileLibraryStore.currentFolderId
    )
    // 同步刷新右侧筛选窗
    fileLibraryStore.panelRefresh()
  } catch (e) {
    alert('移动文件夹失败：' + (e.message || e))
  }
}

// ============================================
// 回收站
// ============================================

async function toggleRecycleBin() {
  showRecycleBin.value = !showRecycleBin.value
  if (showRecycleBin.value) {
    // 进入回收站：清除文件选择
    selectedIds.value = []
    selectedFolderIds.value = []
    recycleSelected.value = { files: [], folders: [] }
    try {
      await fileLibraryStore.loadRecycleBin()
    } catch (e) {
      console.error('加载回收站失败:', e)
    }
  }
}

// 点击分类：在回收站时先退出再跳转
async function onCategoryClick(categoryId) {
  if (showRecycleBin.value) {
    showRecycleBin.value = false
    recycleSelected.value = { files: [], folders: [] }
  }
  await fileLibraryStore.navigateToCategory(categoryId)
}

function toggleRecycleSelect(type, id) {
  const arr = type === 'file' ? recycleSelected.value.files : recycleSelected.value.folders
  const i = arr.indexOf(id)
  if (i > -1) arr.splice(i, 1)
  else arr.push(id)
}

// 还原时发现重名会自动顺延编号（同一目录绝不允许同名），这里明确告诉用户改成了什么
function notifyRenamed(list) {
  if (!list || !list.length) return
  const names = list.map((x) => x.name).join('、')
  alert(`目标目录里已经有同名项，已恢复但自动改名为：\n${names}`)
}

async function batchRestore() {
  try {
    if (recycleSelected.value.files.length > 0) {
      notifyRenamed((await fileLibraryStore.restoreFiles([...recycleSelected.value.files]))?.renamed)
    }
    if (recycleSelected.value.folders.length > 0) {
      notifyRenamed((await fileLibraryStore.restoreFolders([...recycleSelected.value.folders]))?.renamed)
    }
    recycleSelected.value = { files: [], folders: [] }
  } catch (e) {
    alert('恢复失败：' + (e.message || e))
  }
}

function confirmBatchPurge() {
  deleteConfirm.value = {
    show: true,
    type: 'batchPurge',
    target: null,
    message: `确定彻底删除选中的 ${recycleSelected.value.files.length + recycleSelected.value.folders.length} 项吗？\n此操作不可撤销，硬盘文件将被删除。`
  }
}

function restoreAllConfirm() {
  deleteConfirm.value = {
    show: true,
    type: 'restoreAll',
    target: null,
    message: '确定恢复回收站中的所有项目吗？'
  }
}

function confirmEmptyRecycleBin() {
  deleteConfirm.value = {
    show: true,
    type: 'emptyRecycle',
    target: null,
    message: '确定清空回收站吗？\n所有项目将被彻底删除，包括硬盘中的文件。此操作不可撤销。'
  }
}

async function doRestoreFile(id) {
  try {
    notifyRenamed((await fileLibraryStore.restoreFiles([id]))?.renamed)
  } catch (e) {
    alert('恢复失败：' + (e.message || e))
  }
}

async function doRestoreFolder(id) {
  try {
    notifyRenamed((await fileLibraryStore.restoreFolders([id]))?.renamed)
  } catch (e) {
    alert('恢复失败：' + (e.message || e))
  }
}

function confirmPurgeFile(id) {
  deleteConfirm.value = {
    show: true,
    type: 'purgeFile',
    target: id,
    message: '确定彻底删除该文件吗？\n硬盘文件将被删除，此操作不可撤销。'
  }
}

function confirmPurgeFolder(id) {
  deleteConfirm.value = {
    show: true,
    type: 'purgeFolder',
    target: id,
    message: '确定彻底删除该文件夹吗？\n文件夹及其所有内容、硬盘文件将被删除，此操作不可撤销。'
  }
}

// ============================================
// 文件操作
// ============================================

async function editFile(file) {
  // JSON 文件使用批量提示词编辑器
  if (file.file_type === 'json') {
    await openEditBatchPromptsDialog(file)
    return
  }
  const isTextType = ['prompt', 'json', 'workflow', 'rule'].includes(file.file_type)
  const editor = {
    id: file.id,
    name: file.name,
    file_type: file.file_type,
    content: file.content || '',
    isTextType,
    selectedTags: (file.tags || []).map(t => t.id),
    previewSrc: '',
    jsonValid: true,
    jsonData: null,
    // 工作流编辑器专用字段
    workflowData: null,
    selectedNodeId: null,
    editNodeProperty: '',
    editNodeValue: '',
    editMessage: '',
    workflowError: ''
  }
  // 文本类文件：始终从服务器拉取最新内容，避免使用右侧筛选窗的缓存旧内容
  if (isTextType && file.id) {
    try {
      const fresh = await apiClient.getFileLibraryFileById(file.id)
      if (fresh && typeof fresh.content === 'string') {
        editor.content = fresh.content
        if (fresh.name) editor.name = fresh.name
        editor.selectedTags = (fresh.tags || []).map(t => t.id)
      }
    } catch (e) {
      // 拉取失败则使用传入内容
    }
  }
  // 工作流：解析 JSON 内容为节点对象
  if (file.file_type === 'workflow') {
    try {
      const parsed = typeof editor.content === 'string' ? JSON.parse(editor.content) : editor.content
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        editor.workflowData = parsed
      } else {
        editor.workflowError = '工作流数据格式不正确（应为 JSON 对象，键为节点 ID）'
      }
    } catch (e) {
      editor.workflowError = '工作流 JSON 解析失败：' + e.message
    }
  }
  editingFile.value = editor
  // 加载媒体预览
  if (file.file_type === 'image' || file.file_type === 'video' || file.file_type === 'audio') {
    loadPreviewSrc(file)
  }
}

// 新建提示词对话框
function openNewPromptDialog() {
  if (!fileLibraryStore.currentCategoryId) {
    alert('请先选择一个分类')
    return
  }
  const editor = {
    id: null,
    name: '',
    file_type: 'prompt',
    content: '',
    isTextType: true,
    selectedTags: [],
    previewSrc: '',
    jsonValid: true,
    jsonData: null,
    workflowData: null,
    selectedNodeId: null,
    editNodeProperty: '',
    editNodeValue: '',
    editMessage: '',
    workflowError: ''
  }
  editingFile.value = editor
  editorErrorMessage.value = ''
}

// ============ JSON 分镜编辑器 ============

function openNewJsonStoryboardDialog() {
  if (!fileLibraryStore.currentCategoryId) {
    alert('请先选择一个分类')
    return
  }
  jsonStoryboardEditor.id = null
  jsonStoryboardEditor.name = ''
  jsonStoryboardEditor.testText = ''
  jsonStoryboardEditor.parseResult = null
  jsonStoryboardEditor.errorMessage = ''
  jsonStoryboardEditor.successMessage = ''
  jsonStoryboardEditorOpen.value = true
}

function closeJsonStoryboardEditor() {
  jsonStoryboardEditorOpen.value = false
}

function testJsonStoryboardParser() {
  if (!jsonStoryboardEditor.testText || !jsonStoryboardEditor.testText.trim()) {
    jsonStoryboardEditor.parseResult = null
    jsonStoryboardEditor.errorMessage = '请输入 TXT 内容'
    return
  }
  jsonStoryboardEditor.errorMessage = ''
  try {
    const cfg = configStore.storyboardParser
    const result = parseStoryboardWithConfig(jsonStoryboardEditor.testText, cfg)
    jsonStoryboardEditor.parseResult = result
    if (!result || result.length === 0) {
      jsonStoryboardEditor.errorMessage = '未解析到任何分镜，请检查内容或解析规则'
    }
  } catch (e) {
    console.error('测试解析失败:', e)
    jsonStoryboardEditor.parseResult = null
    jsonStoryboardEditor.errorMessage = '解析失败：' + (e.message || '未知错误')
  }
}

async function saveJsonStoryboardFile() {
  if (!jsonStoryboardEditor.parseResult || jsonStoryboardEditor.parseResult.length === 0) {
    jsonStoryboardEditor.errorMessage = '没有可保存的解析结果'
    return
  }
  if (!jsonStoryboardEditor.name.trim()) {
    jsonStoryboardEditor.errorMessage = '请输入名称'
    return
  }
  jsonStoryboardEditor.errorMessage = ''
  try {
    const content = JSON.stringify(jsonStoryboardEditor.parseResult, null, 2)
    if (jsonStoryboardEditor.id) {
      // 编辑现有文件：不传 category_id/folder_id，避免文件被移走
      await fileLibraryStore.updateFile(jsonStoryboardEditor.id, {
        name: jsonStoryboardEditor.name.trim(),
        file_type: 'json',
        content: content,
        prompt_count: jsonStoryboardEditor.parseResult.length,
        is_valid: 1
      })
    } else {
      // 新建文件：使用当前目录
      await fileLibraryStore.createFile({
        category_id: fileLibraryStore.currentCategoryId,
        folder_id: fileLibraryStore.currentFolderId || 0,
        name: jsonStoryboardEditor.name.trim(),
        file_type: 'json',
        content: content,
        prompt_count: jsonStoryboardEditor.parseResult.length,
        is_valid: 1
      })
    }
    await reloadCurrent()
    fileLibraryStore.panelRefresh()
    jsonStoryboardEditor.successMessage = '保存成功 ✓'
    setTimeout(() => {
      closeJsonStoryboardEditor()
      jsonStoryboardEditor.successMessage = ''
    }, 1000)
  } catch (e) {
    jsonStoryboardEditor.errorMessage = '保存失败：' + (e.message || e)
  }
}

// ============ 批量提示词编辑器 ============

function openNewBatchPromptsDialog() {
  if (!fileLibraryStore.currentCategoryId) {
    alert('请先选择一个分类')
    return
  }
  batchPromptsEditor.id = null
  batchPromptsEditor.name = ''
  batchPromptsEditor.prompts = [{ id: 1, content: '' }]
  batchPromptsEditor.nextId = 2
  batchPromptsEditor.errorMessage = ''
  batchPromptsEditor.successMessage = ''
  batchPromptsEditorOpen.value = true
}

function closeBatchPromptsEditor() {
  batchPromptsEditorOpen.value = false
}

async function openEditBatchPromptsDialog(file) {
  // 从服务器拉取最新内容
  let content = file.content || ''
  try {
    const fresh = await apiClient.getFileLibraryFileById(file.id)
    if (fresh && typeof fresh.content === 'string') {
      content = fresh.content
    }
  } catch (e) {
    // 使用传入内容
  }
  // 解析 JSON 内容为提示词列表
  let prompts = [{ id: 1, content: '' }]
  let nextId = 2
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed) && parsed.length > 0) {
      prompts = parsed.map((item, i) => ({
        id: i + 1,
        content: typeof item === 'string' ? item : (item.content || item.prompt || JSON.stringify(item, null, 2))
      }))
      nextId = prompts.length + 1
    } else if (parsed && typeof parsed === 'object') {
      prompts = [{ id: 1, content: JSON.stringify(parsed, null, 2) }]
      nextId = 2
    }
  } catch (e) {
    // 非 JSON 格式，作为纯文本处理
    if (content.trim()) {
      prompts = [{ id: 1, content }]
      nextId = 2
    }
  }
  batchPromptsEditor.id = file.id
  batchPromptsEditor.name = file.name || ''
  batchPromptsEditor.prompts = prompts
  batchPromptsEditor.nextId = nextId
  batchPromptsEditor.errorMessage = ''
  batchPromptsEditor.successMessage = ''
  batchPromptsEditorOpen.value = true
}

function addBatchPromptItem() {
  batchPromptsEditor.prompts.push({ id: batchPromptsEditor.nextId++, content: '' })
}

function removeBatchPromptItem(id) {
  const idx = batchPromptsEditor.prompts.findIndex(p => p.id === id)
  if (idx > -1) {
    batchPromptsEditor.prompts.splice(idx, 1)
  }
  if (batchPromptsEditor.prompts.length === 0) {
    batchPromptsEditor.prompts = [{ id: batchPromptsEditor.nextId++, content: '' }]
  }
}

function doClearBatchPromptsEditor() {
  batchPromptsEditor.prompts = [{ id: batchPromptsEditor.nextId++, content: '' }]
  batchPromptsEditor.name = ''
  batchClearConfirm.value = false
}

async function saveBatchPromptsFile() {
  if (!batchPromptsEditor.name.trim()) {
    batchPromptsEditor.errorMessage = '请输入名称'
    return
  }
  const validPrompts = batchPromptsEditor.prompts.filter(p => p.content.trim())
  batchPromptsEditor.errorMessage = ''
  try {
    // 保存时正序（创建顺序）
    const content = JSON.stringify(
      validPrompts.map((p, i) => ({ id: i + 1, content: p.content.trim() })),
      null, 2
    )
    if (batchPromptsEditor.id) {
      // 编辑现有文件：不传 category_id/folder_id，避免文件被移走
      await fileLibraryStore.updateFile(batchPromptsEditor.id, {
        name: batchPromptsEditor.name.trim(),
        file_type: 'json',
        content: content,
        prompt_count: validPrompts.length,
        is_valid: 1
      })
    } else {
      // 新建文件：使用当前目录
      const saved = await fileLibraryStore.createFile({
        category_id: fileLibraryStore.currentCategoryId,
        folder_id: fileLibraryStore.currentFolderId || 0,
        name: batchPromptsEditor.name.trim(),
        file_type: 'json',
        content: content,
        prompt_count: validPrompts.length,
        is_valid: 1
      })
      // 新建后记录 id，后续保存变为更新（避免重复新建）
      if (saved && saved.id) {
        batchPromptsEditor.id = saved.id
      }
    }
    await reloadCurrent()
    fileLibraryStore.panelRefresh()
    batchPromptsEditor.successMessage = '保存成功 ✓'
    setTimeout(() => {
      batchPromptsEditor.successMessage = ''
    }, 1500)
    // 不关闭窗口，用户可继续输入
  } catch (e) {
    batchPromptsEditor.errorMessage = '保存失败：' + (e.message || e)
  }
}

// 文件类型显示标签
function fileTypeLabel(type) {
  const labels = {
    prompt: '提示词',
    json: 'JSON',
    workflow: '工作流',
    rule: '规则',
    image: '图片',
    video: '视频',
    audio: '音频'
  }
  return labels[type] || '文件'
}

// 工作流编辑器：选择节点
function selectWorkflowNode(nodeId) {
  if (!editingFile.value) return
  editingFile.value.selectedNodeId = nodeId
  editingFile.value.editNodeProperty = ''
  editingFile.value.editNodeValue = ''
  editingFile.value.editMessage = ''

  const node = editingFile.value.workflowData?.[nodeId]
  if (node?.inputs) {
    const props = Object.entries(node.inputs).filter(([, v]) => !Array.isArray(v))
    if (props.length > 0) {
      // 优先选 text 属性（ComfyUI 文本节点），否则选第一个
      const textProp = props.find(p => p[0] === 'text') || props[0]
      editingFile.value.editNodeProperty = textProp[0]
      editingFile.value.editNodeValue = typeof textProp[1] === 'object'
        ? JSON.stringify(textProp[1], null, 2)
        : String(textProp[1])
    }
  }
}

// 工作流编辑器：切换属性
function onWorkflowPropertyChange() {
  if (!editingFile.value) return
  const node = selectedWorkflowNode.value
  if (!node?.inputs || !editingFile.value.editNodeProperty) return
  const value = node.inputs[editingFile.value.editNodeProperty]
  editingFile.value.editNodeValue = typeof value === 'object'
    ? JSON.stringify(value, null, 2)
    : String(value || '')
}

// 工作流编辑器：更新节点属性
async function doUpdateWorkflowNode() {
  if (!editingFile.value?.workflowData || !editingFile.value.selectedNodeId) return
  const nodeId = editingFile.value.selectedNodeId
  const propName = editingFile.value.editNodeProperty
  if (!propName) {
    editingFile.value.editMessage = '请先选择属性'
    return
  }
  try {
    // 深拷贝后修改
    const workflow = JSON.parse(JSON.stringify(editingFile.value.workflowData))
    if (!workflow[nodeId]?.inputs) {
      editingFile.value.editMessage = '节点或 inputs 不存在'
      return
    }
    workflow[nodeId].inputs[propName] = editingFile.value.editNodeValue
    editingFile.value.workflowData = workflow
    editingFile.value.content = JSON.stringify(workflow, null, 2)
    editingFile.value.editMessage = `节点 ${nodeId} 的 ${propName} 已更新（点击"保存"按钮持久化）`
  } catch (e) {
    editingFile.value.editMessage = '更新失败：' + e.message
  }
}

// 工作流编辑器：属性值预览
function formatPreview(value) {
  if (value === null || value === undefined) return 'null'
  const str = String(value)
  return str.length > 20 ? str.slice(0, 20) + '...' : str
}

async function loadPreviewSrc(file) {
  try {
    if (file.thumbnail_data && file.file_type === 'image') {
      editingFile.value.previewSrc = file.thumbnail_data
    }
    const blobUrl = await apiClient.getFileLibraryFileBlobUrl(file.id)
    if (blobUrl && editingFile.value) {
      editingFile.value.previewSrc = blobUrl
    }
  } catch (e) {
    // 预览加载失败，保持缩略图
  }
}

function validateJson(editor) {
  try {
    const data = JSON.parse(editor.content)
    editor.jsonValid = true
    editor.jsonData = data
  } catch (e) {
    editor.jsonValid = false
    editor.jsonData = null
  }
}

// 监听 JSON 内容变化做校验
watch(
  () => editingFile.value?.content,
  (val) => {
    if (editingFile.value && editingFile.value.file_type === 'json') {
      validateJson(editingFile.value)
    }
  }
)

function closeEditor() {
  // 释放预览 blob URL
  if (editingFile.value?.previewSrc && editingFile.value.previewSrc.startsWith('blob:')) {
    URL.revokeObjectURL(editingFile.value.previewSrc)
  }
  editingFile.value = null
  editorErrorMessage.value = ''
}

function toggleEditorTag(tagId) {
  if (!editingFile.value) return
  const i = editingFile.value.selectedTags.indexOf(tagId)
  if (i > -1) editingFile.value.selectedTags.splice(i, 1)
  else editingFile.value.selectedTags.push(tagId)
}

async function doSaveFile() {
  if (!editingFile.value || !editingFile.value.name?.trim()) return
  editorErrorMessage.value = ''
  try {
    const data = {
      name: editingFile.value.name.trim()
    }
    if (editingFile.value.isTextType) {
      data.content = editingFile.value.content
    }
    // JSON 文件：附加校验信息
    if (editingFile.value.file_type === 'json') {
      data.is_valid = editingFile.value.jsonValid ? 1 : 0
      data.validation_message = editingFile.value.jsonValid ? '' : 'JSON 格式错误'
      if (editingFile.value.jsonValid && Array.isArray(editingFile.value.jsonData)) {
        data.prompt_count = editingFile.value.jsonData.length
      }
    }
    if (editingFile.value.replaceBase64) {
      data.image_base64 = editingFile.value.replaceBase64
      data.thumbnail_base64 = editingFile.value.replaceThumb
    }

    let savedFile
    if (editingFile.value.id) {
      // 编辑现有文件
      savedFile = await fileLibraryStore.updateFile(editingFile.value.id, data)
      // 同步标签
      const file = fileLibraryStore.files.find(f => f.id === editingFile.value.id)
      if (file) {
        const oldTagIds = (file.tags || []).map(t => t.id)
        const newTagIds = editingFile.value.selectedTags
        for (const tid of oldTagIds) {
          if (!newTagIds.includes(tid)) {
            await fileLibraryStore.untagFile(file.id, tid)
          }
        }
        for (const tid of newTagIds) {
          if (!oldTagIds.includes(tid)) {
            await fileLibraryStore.tagFile(file.id, tid)
          }
        }
      }
    } else {
      // 新建文件
      data.category_id = fileLibraryStore.currentCategoryId
      data.folder_id = fileLibraryStore.currentFolderId
      data.file_type = editingFile.value.file_type
      savedFile = await fileLibraryStore.createFile(data)
      // 新建后添加选中的标签
      if (savedFile) {
        for (const tid of editingFile.value.selectedTags) {
          await fileLibraryStore.tagFile(savedFile.id, tid)
        }
      }
    }
    await reloadCurrent()
    // 同步刷新右侧筛选窗缓存，使保存后立即生效
    fileLibraryStore.panelRefresh()
    closeEditor()
  } catch (e) {
    editorErrorMessage.value = '保存失败：' + (e.message || e)
  }
}

function triggerReplaceImage() {
  replaceImageInput.value?.click()
}

async function handleReplaceImage(event) {
  const file = event.target.files?.[0]
  if (!file || !editingFile.value) return
  try {
    const base64 = await fileLibraryStore.fileToBase64(file)
    const thumb = await fileLibraryStore.generateThumbnail(base64)
    // 释放旧的预览
    if (editingFile.value.previewSrc && editingFile.value.previewSrc.startsWith('blob:')) {
      URL.revokeObjectURL(editingFile.value.previewSrc)
    }
    editingFile.value.previewSrc = base64
    editingFile.value.replaceBase64 = base64
    editingFile.value.replaceThumb = thumb
  } catch (e) {
    alert('替换图片失败：' + (e.message || e))
  }
  event.target.value = ''
}

function confirmDeleteFile(file) {
  deleteConfirm.value = {
    show: true,
    type: 'file',
    target: file,
    message: `确定删除文件"${file.name}"吗？`
  }
}

function confirmBatchDelete() {
  const folderCount = selectedFolderIds.value.length
  const fileCount = selectedIds.value.length
  if (folderCount > 0) {
    deleteConfirm.value = {
      show: true,
      type: 'batchFolders',
      target: null,
      message: `确定删除选中的 ${folderCount} 个文件夹吗？\n文件夹及其所有内容将移入回收站。`
    }
  } else if (fileCount > 0) {
    deleteConfirm.value = {
      show: true,
      type: 'batch',
      target: null,
      message: `确定删除选中的 ${fileCount} 个文件吗？`
    }
  }
}

async function doDelete() {
  const { type, target } = deleteConfirm.value
  try {
    if (type === 'category') {
      await fileLibraryStore.deleteCategory(target.id)
    } else if (type === 'folder') {
      await fileLibraryStore.deleteFolder(target.id)
      await fileLibraryStore.loadFolders(
        fileLibraryStore.currentCategoryId,
        fileLibraryStore.currentFolderId
      )
    } else if (type === 'file') {
      await fileLibraryStore.deleteFile(target.id)
      selectedIds.value = selectedIds.value.filter(id => id !== target.id)
    } else if (type === 'batch') {
      await fileLibraryStore.batchDeleteFiles([...selectedIds.value])
      selectedIds.value = []
    } else if (type === 'batchFolders') {
      await fileLibraryStore.batchDeleteFolders([...selectedFolderIds.value])
      selectedFolderIds.value = []
      await fileLibraryStore.loadFolders(
        fileLibraryStore.currentCategoryId,
        fileLibraryStore.currentFolderId
      )
    } else if (type === 'batchPurge') {
      if (recycleSelected.value.files.length > 0) {
        await fileLibraryStore.purgeFiles([...recycleSelected.value.files])
      }
      if (recycleSelected.value.folders.length > 0) {
        await fileLibraryStore.purgeFolders([...recycleSelected.value.folders])
      }
      recycleSelected.value = { files: [], folders: [] }
    } else if (type === 'restoreAll') {
      const r = await fileLibraryStore.restoreAll()
      if (r && r.renamed) {
        alert(`已全部恢复。其中 ${r.renamed} 项因目标目录已有同名项，已自动编号改名。`)
      }
    } else if (type === 'emptyRecycle') {
      await fileLibraryStore.emptyRecycleBin()
      recycleSelected.value = { files: [], folders: [] }
    } else if (type === 'purgeFile') {
      await fileLibraryStore.purgeFiles([target])
      recycleSelected.value.files = recycleSelected.value.files.filter(id => id !== target)
    } else if (type === 'purgeFolder') {
      await fileLibraryStore.purgeFolders([target])
      recycleSelected.value.folders = recycleSelected.value.folders.filter(id => id !== target)
    }
  } catch (e) {
    const msg = e?.response?.data?.error || e.message || e
    alert('操作失败：' + msg)
  }
  deleteConfirm.value.show = false
  // 同步刷新右侧筛选窗（删除/移动后保持一致）
  if (['folder', 'file', 'batch', 'batchFolders'].includes(type)) {
    fileLibraryStore.panelRefresh()
  }
}

// ============================================
// 移动文件
// ============================================

function moveSingleFile(file) {
  openMoveModal([file.id], file.category_id, file.folder_id)
}

function openBatchMove() {
  if (selectedFolderIds.value.length > 0) {
    openBatchMoveFolders()
  } else if (selectedIds.value.length > 0) {
    openMoveModal([...selectedIds.value], fileLibraryStore.currentCategoryId, fileLibraryStore.currentFolderId)
  }
}

function openMoveModal(ids, categoryId, folderId) {
  moveTarget.value = {
    ids,
    categoryId: categoryId ?? null,
    folderId: folderId ?? null,
    folders: []
  }
  if (categoryId) loadMoveFolders(categoryId)
}

async function loadMoveFolders(categoryId) {
  try {
    const list = await apiClient.getFileLibraryFolders({ category_id: categoryId, parent_id: 'all' })
    moveTarget.value.folders = buildFolderTree(list || [])
  } catch (e) {
    moveTarget.value.folders = []
  }
}

// 将扁平文件夹列表构建为带缩进的可选树
function buildFolderTree(folders) {
  const map = new Map()
  folders.forEach(f => map.set(f.id, { ...f, children: [], depth: 0 }))
  const roots = []
  for (const f of folders) {
    const node = map.get(f.id)
    if (f.parent_id == null) {
      roots.push(node)
    } else {
      const parent = map.get(f.parent_id)
      if (parent) {
        node.depth = parent.depth + 1
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
  }
  // 扁平化为有序列表（深度优先）
  const result = []
  const walk = (nodes) => {
    for (const n of nodes) {
      result.push(n)
      if (n.children.length > 0) walk(n.children)
    }
  }
  walk(roots)
  return result
}

function onMoveCategoryChange() {
  moveTarget.value.folderId = null
  loadMoveFolders(moveTarget.value.categoryId)
}

async function doMoveFiles() {
  if (!moveTarget.value || !moveTarget.value.categoryId) return
  try {
    if (moveTarget.value.ids.length === 1) {
      // 单个移动用 updateFile
      await fileLibraryStore.updateFile(moveTarget.value.ids[0], {
        category_id: moveTarget.value.categoryId,
        folder_id: moveTarget.value.folderId
      })
    } else {
      await fileLibraryStore.batchMoveFiles(
        moveTarget.value.ids,
        moveTarget.value.categoryId,
        moveTarget.value.folderId
      )
    }
    selectedIds.value = selectedIds.value.filter(id => !moveTarget.value.ids.includes(id))
    moveTarget.value = null
    await reloadCurrent()
    // 同步刷新右侧筛选窗
    fileLibraryStore.panelRefresh()
  } catch (e) {
    alert('移动失败：' + (e.message || e))
  }
}

// ============================================
// 批量打标签
// ============================================

function openBatchTag() {
  batchTagModal.value = {
    ids: [...selectedIds.value],
    tagIds: []
  }
}

function toggleBatchTag(tagId) {
  if (!batchTagModal.value) return
  const i = batchTagModal.value.tagIds.indexOf(tagId)
  if (i > -1) batchTagModal.value.tagIds.splice(i, 1)
  else batchTagModal.value.tagIds.push(tagId)
}

async function doBatchTag() {
  if (!batchTagModal.value || batchTagModal.value.tagIds.length === 0) return
  try {
    for (const tagId of batchTagModal.value.tagIds) {
      await fileLibraryStore.batchTagFiles(batchTagModal.value.ids, tagId)
    }
    batchTagModal.value = null
  } catch (e) {
    alert('打标签失败：' + (e.message || e))
  }
}

// ============================================
// 预览
// ============================================

async function previewFile(file) {
  // 仅图片/视频在大图查看器中打开，其它类型直接进入编辑器
  if (file.file_type !== 'image' && file.file_type !== 'video') {
    editFile(file)
    return
  }
  // 记录当前文件在图片/视频列表中的索引（用于上一张/下一张导航）
  viewerCurrentIndex.value = viewerImages.value.findIndex(f => f.id === file.id)
  viewerSrc.value = ''
  if (file.thumbnail_data) {
    viewerSrc.value = file.thumbnail_data
    viewerVisible.value = true
  }
  try {
    const blobUrl = await apiClient.getFileLibraryFileBlobUrl(file.id)
    if (blobUrl) {
      const oldSrc = viewerSrc.value
      viewerSrc.value = blobUrl
      if (oldSrc && oldSrc.startsWith('blob:')) {
        URL.revokeObjectURL(oldSrc)
      }
    }
  } catch (e) {
    // 获取原图失败，保持缩略图
  }
}

// 上一张/下一张导航：切换到指定索引的图片
async function navigateViewerTo(newIndex) {
  const targetFile = viewerImages.value[newIndex]
  if (!targetFile) return
  viewerCurrentIndex.value = newIndex
  // 先用缩略图占位
  if (targetFile.thumbnail_data) {
    viewerSrc.value = targetFile.thumbnail_data
  }
  try {
    const blobUrl = await apiClient.getFileLibraryFileBlobUrl(targetFile.id)
    if (blobUrl) {
      const oldSrc = viewerSrc.value
      viewerSrc.value = blobUrl
      if (oldSrc && oldSrc.startsWith('blob:')) {
        URL.revokeObjectURL(oldSrc)
      }
    }
  } catch (e) {
    // 获取原图失败，保持缩略图
  }
}

function onViewerPrev(newIndex) {
  navigateViewerTo(newIndex)
}

function onViewerNext(newIndex) {
  navigateViewerTo(newIndex)
}

watch(viewerVisible, (val) => {
  if (!val && viewerSrc.value && viewerSrc.value.startsWith('blob:')) {
    URL.revokeObjectURL(viewerSrc.value)
    viewerSrc.value = ''
  }
})

// ============ 文件内容 hover 预览 ============
const contentTipVisible = ref(false)
const contentTipText = ref('')
const contentTipX = ref(0)
const contentTipY = ref(0)
let contentTipTimer = null
const FL_PREVIEW_TYPES = ['prompt', 'rule']
const FL_MAX_CHARS = 500

function isPreviewableFile(file) {
  return file && FL_PREVIEW_TYPES.includes(file.file_type)
}

function truncateForTip(text) {
  if (!text) return ''
  const t = String(text).replace(/\r/g, '').trim()
  return t.length > FL_MAX_CHARS ? t.slice(0, FL_MAX_CHARS) + '…' : t
}

async function onFileMouseEnter(e, file) {
  if (!isPreviewableFile(file)) return
  contentTipX.value = e.clientX
  contentTipY.value = e.clientY
  contentTipTimer = setTimeout(async () => {
    let content = ''
    if (typeof file.content === 'string' && file.content.trim()) {
      content = file.content
    } else {
      try {
        const full = await apiClient.getFileLibraryFileById(file.id)
        if (full && typeof full.content === 'string') content = full.content
      } catch (err) { /* ignore */ }
    }
    if (content) {
      contentTipText.value = truncateForTip(content)
      contentTipVisible.value = true
    }
  }, 500)
}

function onFileMouseMove(e) {
  contentTipX.value = e.clientX
  contentTipY.value = e.clientY
}

function onFileMouseLeave() {
  if (contentTipTimer) {
    clearTimeout(contentTipTimer)
    contentTipTimer = null
  }
  contentTipVisible.value = false
  contentTipText.value = ''
}

const contentTipStyle = computed(() => {
  const padding = 15
  const tipWidth = 500
  let left = contentTipX.value + padding
  if (left + tipWidth > window.innerWidth - 10) {
    left = contentTipX.value - tipWidth - padding
    if (left < 10) left = 10
  }
  let top = contentTipY.value + padding
  if (top + 300 > window.innerHeight) {
    top = window.innerHeight - 310
    if (top < 10) top = 10
  }
  return { top: top + 'px', left: left + 'px', width: tipWidth + 'px' }
})

// ============ 图片/视频提示词信息弹窗 ============
const fileInfoOpen = ref(false)
const fileInfoTarget = ref(null)
const fileInfoText = ref('')
const fileInfoLoading = ref(false)
const fileInfoCopyStatus = ref('复制')

async function showFileInfo(file) {
  fileInfoTarget.value = file
  fileInfoText.value = ''
  fileInfoCopyStatus.value = '复制'
  fileInfoLoading.value = true
  fileInfoOpen.value = true
  try {
    let prompt = ''
    if (typeof file.description === 'string' && file.description.trim()) {
      prompt = file.description
    } else {
      const full = await apiClient.getFileLibraryFileById(file.id)
      if (full && typeof full.description === 'string') prompt = full.description
    }
    fileInfoText.value = prompt || ''
  } catch (err) {
    fileInfoText.value = '加载失败：' + (err.message || err)
  } finally {
    fileInfoLoading.value = false
  }
}

async function copyFileInfoPrompt() {
  const text = fileInfoText.value || ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    fileInfoCopyStatus.value = '已复制'
    setTimeout(() => { fileInfoCopyStatus.value = '复制' }, 2000)
  } catch (e) {
    fileInfoCopyStatus.value = '复制失败'
    setTimeout(() => { fileInfoCopyStatus.value = '复制' }, 2000)
  }
}

// ============================================
// 筛选类型变化时重新加载
// ============================================

watch(filterType, () => {
  if (fileLibraryStore.currentCategoryId) {
    reloadCurrent()
  }
})

// 切换分类/文件夹时自动清空选择（避免上一目录的选择残留）
watch(
  () => fileLibraryStore.currentFolderId,
  () => {
    selectedIds.value = []
    selectedFolderIds.value = []
  }
)
watch(
  () => fileLibraryStore.currentCategoryId,
  () => {
    selectedIds.value = []
    selectedFolderIds.value = []
  }
)

// ============================================
// 初始化
// ============================================

onMounted(() => {
  fileLibraryStore.loadAll()
  onEditFile((file) => {
    editFile(file)
  })
})

// 拖拽接收：从右侧筛选窗拖入文件/文件夹到当前列表
const {
  isOver: listDropIsOver,
  isAcceptable: listDropAccept,
  onDragOver: onListDragOver,
  onDragLeave: onListDragLeave,
  onDropEvent: onListDrop
} = useDropTarget(
  (types) => types.includes('application/x-rfp-file') || types.includes('application/x-rfp-folder'),
  async (item) => {
    if (!item) return
    if (item._kind === 'file') {
      await fileLibraryStore.batchMoveFiles(
        [item.id],
        fileLibraryStore.currentCategoryId,
        fileLibraryStore.currentFolderId
      )
      await fileLibraryStore.loadFiles(
        fileLibraryStore.currentCategoryId,
        fileLibraryStore.currentFolderId
      )
      // 同步刷新右侧筛选窗
      fileLibraryStore.panelRefresh()
    } else if (item._kind === 'folder') {
      if (item.id === fileLibraryStore.currentFolderId) {
        alert('不能将文件夹移入自身')
        return
      }
      await fileLibraryStore.batchMoveFolders(
        [item.id],
        fileLibraryStore.currentCategoryId,
        fileLibraryStore.currentFolderId
      )
      await fileLibraryStore.loadFolders(
        fileLibraryStore.currentCategoryId,
        fileLibraryStore.currentFolderId
      )
      // 同步刷新右侧筛选窗
      fileLibraryStore.panelRefresh()
    }
  }
)
</script>

<style scoped>
.file-library {
  background: transparent;
  border-radius: 0;
  padding: 20px;
  position: relative;
}

.file-library.drag-over {
  outline: 2px dashed var(--accent-color, #4a9eff);
  outline-offset: -2px;
  background: rgba(74, 158, 255, 0.06);
}

.file-library.drag-over.drag-forbidden {
  outline-color: #ef4444;
  cursor: not-allowed;
}

/* 上传区域切换条 */
.upload-toggle-bar {
  margin-bottom: 8px;
}
.upload-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: var(--bg-surface, #1a1a2a);
  color: var(--text-secondary, #888);
  border: 1px solid var(--border-color, rgba(128,128,128,0.2));
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}
.upload-toggle-btn:hover {
  color: var(--text-primary, #e0e0e0);
  border-color: var(--accent-color, #4a9eff);
}
.toggle-arrow {
  font-size: 10px;
  transition: transform 0.2s ease;
}

/* 上传区域 */
.upload-zone {
  border: 2px dashed var(--border-color, #444);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-surface, #1a1a2a);
}

.upload-zone:hover,
.upload-zone.dragover {
  border-color: var(--accent-color, #4a9eff);
  background: rgba(74, 158, 255, 0.05);
}

/* 双上传框布局 */
.upload-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.upload-row .upload-zone {
  flex: 1;
  min-width: 240px;
  margin-bottom: 0;
}

/* 通用上传框：蓝色主题 */
.upload-zone.general-zone {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.04);
}

.upload-zone.general-zone:hover,
.upload-zone.general-zone.dragover {
  border-color: #2563eb;
  background: rgba(59, 130, 246, 0.1);
}

/* TXT 转换框：绿色主题 */
.upload-zone.txt-zone {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.04);
}

.upload-zone.txt-zone:hover,
.upload-zone.txt-zone.dragover {
  border-color: #059669;
  background: rgba(16, 185, 129, 0.1);
}

.zone-title {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
}

.general-title {
  color: #2563eb;
}

.txt-title {
  color: #059669;
}

.upload-text p {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text-primary, #e0e0e0);
  font-weight: 500;
}

.upload-text small {
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.upload-target {
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent-color, #4a9eff);
  font-weight: 500;
}

/* TXT 转换进度区 */
.convert-progress {
  background: var(--bg-surface, #1a1a2a);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.15));
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.1));
}

.progress-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
}

.progress-summary {
  font-size: 12px;
  color: var(--text-secondary, #888);
  display: flex;
  align-items: center;
  gap: 8px;
}

.converting-tag {
  color: var(--accent-color, #4a9eff);
}

.btn-clear-progress {
  padding: 2px 10px;
  background: transparent;
  border: 1px solid var(--border-color, #444);
  border-radius: 6px;
  color: var(--text-secondary, #888);
  font-size: 11px;
  cursor: pointer;
}

.btn-clear-progress:hover {
  background: var(--bg-secondary, #2a2a3a);
  color: var(--text-primary, #e0e0e0);
}

.progress-list {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  background: var(--bg-secondary, #2a2a3a);
}

.progress-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary, #e0e0e0);
  max-width: 60%;
}

.progress-status {
  flex-shrink: 0;
}

.tag-ok {
  color: #2ecc71;
  font-weight: 600;
}

.tag-fail {
  color: #e74c3c;
  font-weight: 600;
}

.tag-pending {
  color: var(--text-secondary, #888);
}

.progress-item.fail {
  background: rgba(231, 76, 60, 0.06);
}

.progress-item.success {
  background: rgba(46, 204, 113, 0.06);
}

/* 对话框错误提示 */
.dialog-error {
  padding: 8px 12px;
  margin-bottom: 12px;
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  border-radius: 8px;
  font-size: 12px;
  border: 1px solid rgba(231, 76, 60, 0.3);
}

/* 工作流编辑器：左右分栏布局 */
.workflow-editor-layout {
  display: flex;
  gap: 20px;
  min-height: 400px;
}

.editor-left {
  flex: 0 0 250px;
}

.editor-right {
  flex: 1;
  min-width: 0;
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 500px;
  overflow-y: auto;
  padding: 8px;
  background: var(--bg-surface, #1a1a2a);
  border-radius: 8px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.15));
}

.node-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  background: var(--bg-secondary, #2a2a3a);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  gap: 8px;
}

.node-item:hover {
  background: var(--bg-primary, #141414);
}

.node-item.active {
  background: var(--accent-color, #4a9eff);
  color: var(--accent-text, #fff);
}

.node-id {
  font-weight: 600;
  font-size: 13px;
  font-family: var(--font-mono, 'Roboto Mono', ui-monospace, monospace);
  min-width: 40px;
}

.node-type {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-id-container {
  margin-bottom: 12px;
  font-size: 13px;
  display: flex;
  gap: 16px;
  align-items: center;
  color: var(--text-primary, #e0e0e0);
}

.node-class {
  color: var(--text-secondary, #888);
}

.edit-panel {
  margin-bottom: 16px;
}

.edit-message {
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent-color, #4a9eff);
  padding: 6px 10px;
  background: rgba(74, 158, 255, 0.08);
  border-radius: 6px;
}

/* JSON 编辑器样式 */
.json-editor {
  font-family: var(--font-mono, 'Roboto Mono', ui-monospace, monospace);
  font-size: 13px;
  min-height: 320px;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-x: hidden;
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
  padding: 4px;
  background: var(--bg-surface, #1a1a2a);
  border-radius: 10px;
  flex-wrap: wrap;
  flex: 1;
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary, #888);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  transition: all 0.2s ease;
  white-space: nowrap;
  background: var(--bg-tab, transparent);
  border-bottom: 2px solid transparent;
  position: relative;
}

.category-tab:hover {
  color: var(--text-primary, #e0e0e0);
}

.category-tab.active {
  color: var(--text-primary, #e0e0e0);
  border-bottom-color: var(--accent-color, #4a9eff);
}

.cat-count {
  font-size: 11px;
  opacity: 0.7;
  padding: 0 5px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  line-height: 1.4;
}

.category-tab.active .cat-count {
  background: rgba(255, 255, 255, 0.25);
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
  color: var(--text-secondary, #888);
  font-size: 10px;
  cursor: pointer;
  line-height: 1.2;
}

.cat-action-btn:hover {
  background: var(--bg-secondary, #2a2a3a);
  color: var(--text-primary, #e0e0e0);
}

.cat-action-btn.danger:hover {
  background: #fee2e2;
  color: #ef4444;
  border-color: #ef4444;
}

/* 面包屑 */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--bg-surface, #1a1a2a);
  border-radius: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}

/* 分类分隔符 */
.category-divider {
  display: flex;
  align-items: center;
  color: var(--text-muted, #555);
  font-size: 16px;
  padding: 0 6px;
  user-select: none;
}

/* 创建按钮行 */
.create-buttons-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

/* JSON 分镜编辑器 */
.json-storyboard-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.parse-result-info {
  font-size: 13px;
  color: var(--text-secondary, #888);
}

.parse-result-preview {
  max-height: 300px;
  overflow-y: auto;
  background: var(--bg-primary, #0f0f1a);
  border-radius: 8px;
  padding: 12px;
  margin-top: 8px;
}

.parse-result-item {
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
  padding-bottom: 8px;
}

.parse-result-item pre {
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-secondary, #888);
  margin: 4px 0 0 0;
}

.parse-more {
  text-align: center;
  color: var(--text-muted, #555);
  font-size: 12px;
  margin-top: 8px;
}

/* 批量提示词编辑器 */
.batch-prompts-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.batch-prompts-toolbar .btn {
  height: 34px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.batch-add-btn {
  min-width: 34px;
  font-size: 18px;
  font-weight: 600;
  padding: 0 !important;
}

.batch-name-input {
  flex: 1;
  min-width: 200px;
  padding: 6px 10px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  height: 34px;
  box-sizing: border-box;
}

.batch-name-input:focus {
  outline: none;
  border-color: var(--accent-color, #3b82f6);
}

.batch-prompts-list {
  max-height: 500px;
  overflow-y: auto;
}

.batch-prompt-group {
  position: relative;
  margin-bottom: 12px;
}

.batch-prompt-wrapper {
  position: relative;
}

.batch-prompt-wrapper .content-editor {
  width: calc(100% - 38px);
  height: 120px;
  min-height: 0;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid rgba(128, 128, 128, 0.6);
  border-radius: 8px;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
  box-shadow: none;
}

.batch-prompt-wrapper .content-editor:focus {
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

.breadcrumb-item {
  color: var(--text-secondary, #888);
  cursor: pointer;
  transition: color 0.15s;
}

.breadcrumb-item:hover {
  color: var(--accent-color, #4a9eff);
}

.breadcrumb-item.active {
  color: var(--text-primary, #e0e0e0);
  font-weight: 600;
}

.breadcrumb-sep {
  color: var(--text-muted, #555);
}

.breadcrumb-label {
  color: var(--text-secondary, #888);
  font-weight: 500;
  margin-right: 4px;
}

.breadcrumb-count {
  font-size: 11px;
  color: var(--text-muted, #555);
  margin-left: 2px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-select {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  box-shadow: none;
}

.search-input {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  width: 200px;
  box-shadow: none;
  box-sizing: border-box;
}

.search-input:focus,
.filter-select:focus {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent-color);
}


/* 文件夹区域 */
.folder-section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
}

.folder-list {
  margin-bottom: 12px;
}

.folder-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
}

.folder-list-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bg-surface, #1a1a2a);
  border: 1px solid var(--border-color, #3a3a4a);
  border-radius: 8px;
  padding: 8px;
}

.folder-row-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color, #3a3a4a);
  font-size: 11px;
  color: var(--text-secondary, #888);
  font-weight: 600;
}

.folder-row-header .col-check,
.folder-row .col-check {
  width: 24px;
  flex-shrink: 0;
}

.folder-row-header .folder-col-icon,
.folder-row .folder-col-icon {
  width: 40px;
  flex-shrink: 0;
  text-align: center;
}

.folder-row-header .folder-col-name,
.folder-row .folder-col-name {
  flex: 1;
  min-width: 0;
}

.folder-row-header .folder-col-meta,
.folder-row .folder-col-meta {
  width: 200px;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-secondary, #888);
}

.folder-row-header .folder-col-actions,
.folder-row .folder-col-actions {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.folder-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--bg-secondary, #2a2a3a);
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.folder-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.folder-row.selected {
  border-color: var(--accent-color, #4a9eff);
  background: rgba(74, 158, 255, 0.08);
}

.folder-row .folder-col-name {
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-row .col-check {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.folder-list-rows .checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-muted, #555);
  border-radius: 4px;
  background: transparent;
  transition: all 0.15s;
}

.folder-list-rows .checkbox.checked {
  background: var(--accent-color, #4a9eff);
  border-color: var(--accent-color, #4a9eff);
}

.folder-list-rows .checkbox.checked::after {
  content: '✓';
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  line-height: 1;
}

.folder-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-surface, #1a1a2a);
  border-radius: 8px;
  border: 1px solid var(--border-color, #3a3a4a);
  transition: all 0.15s ease;
  cursor: default;
}

.folder-card-top {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.folder-card:hover {
  border-color: var(--accent-color, #4a9eff);
  background: var(--bg-secondary, #2a2a3a);
}

.folder-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.folder-info {
  flex: 1;
  min-width: 0;
}

.folder-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #e0e0e0);
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.callable-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: rgba(46, 204, 113, 0.2);
  color: #2ecc71;
  border-radius: 4px;
  border: 1px solid rgba(46, 204, 113, 0.4);
}

.folder-meta {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: var(--text-secondary, #888);
  margin-top: 2px;
}

.folder-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
  border-top: 1px solid var(--border-color, #3a3a4a);
  padding-top: 8px;
}

/* 文件网格 */
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
}

.file-card {
  background: var(--bg-surface, #1a1a2a);
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  border: 2px solid transparent;
}

.file-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--card-shadow);
}

.file-card.selected {
  border-color: var(--accent-color, #4a9eff);
}

.card-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: var(--bg-secondary, #141414);
  cursor: zoom-in;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-thumb img,
.card-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-icon {
  font-size: 40px;
}

.thumb-check {
  position: absolute;
  top: 6px;
  left: 6px;
  cursor: pointer;
  padding: 4px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 6px;
}

.checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-muted, #555);
  border-radius: 4px;
  transition: all 0.15s ease;
  background: transparent;
}

.checkbox.checked {
  background: var(--accent-color, #4a9eff);
  border-color: var(--accent-color, #4a9eff);
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

.card-info {
  padding: 8px 10px;
  flex: 1;
}

.card-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #e0e0e0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary, #888);
  margin-bottom: 4px;
}

.card-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tag-chip {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  color: white;
  white-space: nowrap;
}

.card-actions {
  display: flex;
  gap: 4px;
  padding: 4px 8px 8px;
  border-top: 1px solid var(--border-color, rgba(128, 128, 128, 0.1));
}

.btn-icon-sm {
  flex: 1;
  padding: 4px 6px;
  background: transparent;
  border: 1px solid var(--text-muted, #555);
  border-radius: 4px;
  color: var(--text-secondary, #888);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-icon-sm:hover {
  background: var(--bg-secondary, #2a2a3a);
  color: var(--text-primary, #e0e0e0);
  border-color: var(--accent-color, #4a9eff);
}

.btn-icon-sm.danger:hover {
  background: #fee2e2;
  color: #ef4444;
  border-color: #ef4444;
}

/* 文件列表 */
.file-list {
  background: var(--bg-surface, #1a1a2a);
  border-radius: 10px;
  overflow: hidden;
}

.file-list .list-header {
  display: grid;
  grid-template-columns: 40px 50px minmax(180px, 1.5fr) 80px 120px 100px 200px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  align-items: center;
}

.file-list .list-row {
  display: grid;
  grid-template-columns: 40px 50px minmax(180px, 1.5fr) 80px 120px 100px 200px;
  padding: 8px 12px;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  cursor: default;
  transition: background 0.15s;
}

.file-list .list-row:hover {
  background: var(--bg-secondary, #141414);
}

.file-list .list-row.selected {
  background: rgba(74, 158, 255, 0.08);
}

.file-list .col-check {
  cursor: pointer;
}

.file-list .col-thumb {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-secondary);
  cursor: zoom-in;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-list .list-header .col-thumb {
  width: auto;
  height: auto;
  background: none;
}

.file-list .col-thumb img,
.file-list .col-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-list .col-thumb .thumb-icon {
  font-size: 18px;
}

.file-list .col-name {
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 8px;
}

.file-list .list-row .col-name:hover {
  color: var(--text-primary);
}

.file-list .col-type,
.file-list .col-date {
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.type-label {
  font-size: 12px;
  font-weight: 500;
}

.file-list .col-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  overflow: hidden;
  max-height: 44px;
}

.file-list .col-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-start;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary, #888);
}

.empty-hint {
  color: var(--text-muted, #555);
  font-size: 12px;
  font-style: italic;
}

/* 按钮 */
.btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
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

/* 批量按钮分隔符 */
.btn-divider {
  color: var(--text-tertiary, #666);
  margin: 0 4px;
  opacity: 0.5;
}

.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  box-sizing: border-box;
}

.btn-primary {
  background: var(--accent-color);
  color: var(--accent-text);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.85;
  color: var(--accent-text);
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-icon-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: var(--bg-surface);
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1;
  box-sizing: border-box;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: none;
}

.btn-icon-toggle:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.btn-icon-toggle.active {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* 单张图片上传选择 / 裁切 */
.upload-hint {
  color: var(--text-secondary, #888);
  margin-bottom: 16px;
}

.choice-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.choice-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
  border: none;
  border-radius: 10px;
  background: var(--bg-surface);
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary);
  box-shadow: var(--input-shadow);
}

.choice-btn:hover {
  box-shadow: var(--card-shadow);
}

.choice-icon {
  font-size: 28px;
}

.choice-title {
  font-weight: 600;
  font-size: 14px;
}

.choice-desc {
  font-size: 12px;
  color: var(--text-secondary, #888);
  text-align: center;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-primary, #e0e0e0);
}

.form-group input[type="text"],
.form-group input[type="color"],
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  box-sizing: border-box;
  box-shadow: var(--input-shadow);
  font-family: inherit;
}

.form-group input[type="text"]:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-color);
}

.form-group input[type="color"] {
  width: auto;
  padding: 4px;
  height: 36px;
}

.form-group input[type="checkbox"] {
  width: auto;
  margin-right: 6px;
}

.content-editor {
  font-family: var(--font-mono, 'Roboto Mono', ui-monospace, monospace);
  font-size: 13px;
  resize: vertical;
  min-height: 240px;
  line-height: 1.5;
}

.editor-info {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.valid-badge {
  font-weight: 600;
}

.valid-badge.valid {
  color: #2ecc71;
}

.valid-badge.invalid {
  color: #e74c3c;
}

/* 功能文件编辑器摘要 */
.function-summary {
  padding: 8px 12px;
  background: var(--bg-secondary, rgba(128, 128, 128, 0.08));
  border-left: 3px solid var(--accent-color, #4a9eff);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
  margin-bottom: 8px;
  line-height: 1.5;
}

.function-summary.empty {
  color: var(--text-secondary, #888);
  font-style: italic;
}

.summary-type {
  font-weight: 600;
  color: var(--accent-color, #4a9eff);
}

.function-error {
  padding: 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
}

.function-error p {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-primary);
}

.function-error .hint {
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.function-edit-hint {
  color: var(--text-secondary, #888);
  font-size: 11px;
  margin-left: 4px;
}

.image-preview-box {
  width: 100%;
  max-height: 320px;
  background: var(--bg-surface);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.image-preview-box img,
.image-preview-box video {
  max-width: 100%;
  max-height: 320px;
  object-fit: contain;
}

.preview-placeholder {
  padding: 40px;
  color: var(--text-muted, #555);
  font-size: 13px;
}

/* 标签选择器 */
.tag-selector {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px;
  background: var(--bg-surface);
  border-radius: 8px;
  min-height: 44px;
  align-items: center;
}

.tag-option {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid;
  cursor: pointer;
  color: var(--text-primary, #e0e0e0);
  transition: all 0.15s;
  user-select: none;
}

.tag-option.selected {
  color: white;
}

.tag-option:hover {
  opacity: 0.85;
}

/* 标签管理列表 */
.tag-create-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.tag-create-row input[type="text"] {
  flex: 1;
}

.tag-create-row input[type="color"] {
  width: 36px;
  height: 32px;
  padding: 2px;
}

.tag-list {
  max-height: 320px;
  overflow-y: auto;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.1));
}

.tag-color-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tag-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
}

.tag-row input[type="text"] {
  flex: 1;
  padding: 4px 8px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 4px;
  box-shadow: var(--input-shadow);
}

.tag-row input[type="color"] {
  width: 32px;
  height: 28px;
  padding: 2px;
}

.tag-row-actions {
  display: flex;
  gap: 4px;
}

.tag-row-actions .btn-icon-sm {
  flex: none;
}

/* 确认弹窗内的消息段落（FloatingWindow 的 size=confirm 内） */
.fw-confirm-msg {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary, #e0e0e0);
  white-space: pre-line;
  line-height: 1.6;
}

/* ============================================ */
/* 文件夹选择 / 批量操作栏                       */
/* ============================================ */

.folder-card.selected {
  border-color: var(--accent-color, #4a9eff);
  background: rgba(74, 158, 255, 0.08);
}

.folder-check {
  flex-shrink: 0;
  cursor: pointer;
  padding: 4px;
}

.folder-check .checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-muted, #555);
  border-radius: 4px;
  background: transparent;
  transition: all 0.15s;
}

.folder-check .checkbox.checked {
  background: var(--accent-color, #4a9eff);
  border-color: var(--accent-color, #4a9eff);
}

.folder-check .checkbox.checked::after {
  content: '✓';
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  line-height: 1;
}

.folder-batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(74, 158, 255, 0.08);
  border: 1px solid var(--accent-color, #4a9eff);
  border-radius: 8px;
}

.selected-info {
  font-size: 12px;
  color: var(--accent-color, #4a9eff);
  font-weight: 500;
}

/* ============================================ */
/* 标签筛选                                       */
/* ============================================ */

.tag-filter-area {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.selected-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.filter-tag-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  color: #fff;
  border-radius: 10px;
  cursor: default;
  user-select: none;
}

.filter-tag-remove {
  background: rgba(0, 0, 0, 0.4);
  border: none;
  color: #fff;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.filter-tag-remove:hover {
  background: rgba(0, 0, 0, 0.7);
}

.tag-filter-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 0;
  min-height: 80px;
  max-height: 320px;
  overflow-y: auto;
}

.tag-filter-list .tag-option {
  cursor: pointer;
}

/* ============================================ */
/* 回收站视图                                     */
/* ============================================ */

.recycle-bin {
  margin-top: 12px;
}

.recycle-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(231, 76, 60, 0.08);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 8px;
  flex-wrap: wrap;
}

.recycle-count {
  font-size: 12px;
  color: var(--text-secondary, #888);
  font-weight: 500;
  margin-right: 8px;
}

.recycle-section {
  margin-bottom: 16px;
}

.recycle-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--bg-surface, #1a1a2a);
  border: 1px solid var(--border-color, #3a3a4a);
  border-radius: 8px;
  padding: 8px;
}

.recycle-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  background: var(--bg-secondary, #2a2a3a);
  border-radius: 6px;
  transition: background 0.15s;
}

.recycle-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.recycle-row .col-check {
  flex-shrink: 0;
  cursor: pointer;
}

.recycle-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.recycle-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recycle-date {
  font-size: 11px;
  color: var(--text-secondary, #888);
  flex-shrink: 0;
}

.recycle-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.recycle-list .checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-muted, #555);
  border-radius: 4px;
  background: transparent;
  transition: all 0.15s;
}

.recycle-list .checkbox.checked {
  background: var(--accent-color, #4a9eff);
  border-color: var(--accent-color, #4a9eff);
}

.recycle-list .checkbox.checked::after {
  content: '✓';
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  line-height: 1;
}
</style>

<style>
.fl-content-tip {
  position: fixed;
  background: rgba(20, 20, 20, 0.95);
  color: #f0f0f0;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12px;
  z-index: 99999;
  pointer-events: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  animation: fl-tip-fade-in 0.15s ease;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.fl-content-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
  color: #f0f0f0;
}

@keyframes fl-tip-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 图片/视频信息弹窗样式（与 RightFilterPanel 一致） */
.file-info-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
  gap: 12px;
}

.file-info-modal-header h4 {
  margin: 0;
  color: var(--text-primary, #f0f0f0);
  font-size: 16px;
  font-weight: 600;
  flex: 1;
  word-break: break-all;
}

.file-info-modal-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.file-info-item {
  display: flex;
  flex-direction: column;
}

.file-info-item strong {
  font-size: 14px;
  color: var(--text-secondary, #aaa);
  margin-bottom: 8px;
}

.file-info-prompt-wrap {
  flex: 1;
  display: flex;
}

.file-info-prompt-wrap textarea {
  width: 100%;
  padding: 12px;
  background: var(--bg-secondary, rgba(255,255,255,0.05));
  color: var(--text-primary, #f0f0f0);
  border: none;
  border-radius: 8px;
  resize: vertical;
  min-height: 200px;
  font-size: 14px;
  line-height: 1.6;
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.file-info-copy-container {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}

.file-info-copy-btn {
  padding: 6px 16px;
  background: var(--accent-color, #4a9eff);
  color: var(--accent-text, #fff);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: opacity 0.15s ease;
}

.file-info-copy-btn:hover {
  opacity: 0.85;
}
</style>
