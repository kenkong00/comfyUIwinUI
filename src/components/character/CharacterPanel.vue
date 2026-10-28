<template>
  <div class="card character-panel">
    <h2>角色库</h2>
    <p class="section-desc">管理AI角色、团队配置和全局规则</p>

    <div class="tabs">
      <div class="tab-item" :class="{ active: activeTab === 'character' }" @click="activeTab = 'character'">角色配置</div>
      <div class="tab-item" :class="{ active: activeTab === 'team' }" @click="activeTab = 'team'">团队配置</div>
      <div class="tab-item" :class="{ active: activeTab === 'global' }" @click="activeTab = 'global'">全局规则设置</div>
    </div>

    <!-- Tab 1: 角色配置 -->
    <div v-show="activeTab === 'character'" class="tab-content">
      <!-- 分类标签 -->
      <div class="category-bar">
        <div class="category-tabs">
          <div
            v-for="cat in characterStore.allCharacterCategories"
            :key="cat.id"
            :class="['category-tab', { active: charActiveCategory === cat.id }]"
            @click="switchCharCategory(cat.id)"
          >
            <span class="cat-name">{{ cat.name }}</span>
            <span class="cat-count">{{ characterStore.getCharacterCategoryCount(cat.id) }}</span>
            <span v-if="!cat.is_system && cat.id !== 'all'" class="cat-actions" @click.stop>
              <button class="cat-action-btn" @click="renameCharCategory(cat)" title="重命名">改</button>
              <button class="cat-action-btn danger" @click="confirmDeleteCharCategory(cat)" title="删除">删</button>
            </span>
          </div>
        </div>
        <button class="btn btn-sm" @click="showAddCharCategory = true">+ 添加分类</button>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn btn-sm btn-primary" @click="startCreateCharacter">+ 新建角色</button>
          <button class="btn btn-sm" @click="toggleCharSelectAll">{{ charAllSelected ? '取消全选' : '全选' }}</button>
          <button v-if="charSelectedIds.length > 0" class="btn btn-sm btn-danger" @click="confirmBatchDeleteCharacters">
            删除选中 ({{ charSelectedIds.length }})
          </button>
          <button v-if="charSelectedIds.length > 0" class="btn btn-sm" @click="showCharBatchMove = true">
            移动选中
          </button>
        </div>
        <div class="toolbar-right">
          <input type="text" v-model="charSearchQuery" placeholder="搜索角色..." class="search-input" />
        </div>
      </div>

      <!-- 角色列表 -->
      <div class="entity-list" v-if="filteredCharacters.length > 0">
        <div class="list-header">
          <div class="col-check"></div>
          <div class="col-avatar">头像</div>
          <div class="col-name">名称</div>
          <div class="col-gender">性别</div>
          <div class="col-cat">分类</div>
          <div class="col-date">更新时间</div>
          <div class="col-actions">操作</div>
        </div>
        <div
          v-for="char in filteredCharacters"
          :key="char.id"
          :class="['list-row', { selected: charSelectedIds.includes(char.id) }]"
        >
          <div class="col-check" @click.stop="toggleCharSelect(char.id)">
            <div :class="['checkbox', { checked: charSelectedIds.includes(char.id) }]"></div>
          </div>
          <div class="col-avatar" @click="editCharacter(char)">
            <div class="row-avatar">
              <img v-if="getAvatarUrl(char)" :src="getAvatarUrl(char)" alt="" />
              <span v-else>{{ (char.name || '?').charAt(0) }}</span>
            </div>
          </div>
          <div class="col-name" @click="editCharacter(char)" :title="char.description || char.name">{{ char.name || '未命名' }}</div>
          <div class="col-gender">{{ char.gender || '-' }}</div>
          <div class="col-cat">{{ characterStore.getCharacterCategoryName(char.category_id) }}</div>
          <div class="col-date">{{ formatDate(char.updated_at || char.created_at) }}</div>
          <div class="col-actions" @click.stop>
            <button class="btn-icon-sm" @click="editCharacter(char)" title="编辑">编辑</button>
            <button class="btn-icon-sm" @click="moveCharacter(char)" title="移动分类">移动</button>
            <button class="btn-icon-sm danger" @click="confirmDeleteCharacter(char)" title="删除">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p v-if="charSearchQuery">没有找到匹配的角色</p>
        <p v-else>暂无角色，点击"+ 新建角色"开始</p>
      </div>
    </div>

    <!-- Tab 2: 团队配置 -->
    <div v-show="activeTab === 'team'" class="tab-content">
      <!-- 分类标签 -->
      <div class="category-bar">
        <div class="category-tabs">
          <div
            v-for="cat in characterStore.allTeamCategories"
            :key="cat.id"
            :class="['category-tab', { active: teamActiveCategory === cat.id }]"
            @click="switchTeamCategory(cat.id)"
          >
            <span class="cat-name">{{ cat.name }}</span>
            <span class="cat-count">{{ characterStore.getTeamCategoryCount(cat.id) }}</span>
            <span v-if="!cat.is_system && cat.id !== 'all'" class="cat-actions" @click.stop>
              <button class="cat-action-btn" @click="renameTeamCategory(cat)" title="重命名">改</button>
              <button class="cat-action-btn danger" @click="confirmDeleteTeamCategory(cat)" title="删除">删</button>
            </span>
          </div>
        </div>
        <button class="btn btn-sm" @click="showAddTeamCategory = true">+ 添加分类</button>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn btn-sm btn-primary" @click="startCreateTeam">+ 新建团队</button>
          <button class="btn btn-sm" @click="toggleTeamSelectAll">{{ teamAllSelected ? '取消全选' : '全选' }}</button>
          <button v-if="teamSelectedIds.length > 0" class="btn btn-sm btn-danger" @click="confirmBatchDeleteTeams">
            删除选中 ({{ teamSelectedIds.length }})
          </button>
          <button v-if="teamSelectedIds.length > 0" class="btn btn-sm" @click="showTeamBatchMove = true">
            移动选中
          </button>
        </div>
        <div class="toolbar-right">
          <input type="text" v-model="teamSearchQuery" placeholder="搜索团队..." class="search-input" />
        </div>
      </div>

      <!-- 团队列表 -->
      <div class="entity-list" v-if="filteredTeams.length > 0">
        <div class="list-header">
          <div class="col-check"></div>
          <div class="col-name">团队名</div>
          <div class="col-members">成员数</div>
          <div class="col-cat">分类</div>
          <div class="col-date">创建时间</div>
          <div class="col-actions">操作</div>
        </div>
        <div
          v-for="team in filteredTeams"
          :key="team.id"
          :class="['list-row', { selected: teamSelectedIds.includes(team.id) }]"
        >
          <div class="col-check" @click.stop="toggleTeamSelect(team.id)">
            <div :class="['checkbox', { checked: teamSelectedIds.includes(team.id) }]"></div>
          </div>
          <div class="col-name" @click="editTeam(team)" :title="team.description || team.name">{{ team.name || '未命名' }}</div>
          <div class="col-members">{{ getMemberCount(team) }}</div>
          <div class="col-cat">{{ characterStore.getTeamCategoryName(team.category_id) }}</div>
          <div class="col-date">{{ formatDate(team.created_at) }}</div>
          <div class="col-actions" @click.stop>
            <button class="btn-icon-sm" @click="editTeam(team)" title="编辑">编辑</button>
            <button class="btn-icon-sm" @click="moveTeam(team)" title="移动分类">移动</button>
            <button class="btn-icon-sm danger" @click="confirmDeleteTeam(team)" title="删除">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <p v-if="teamSearchQuery">没有找到匹配的团队</p>
        <p v-else>暂无团队，点击"+ 新建团队"开始</p>
      </div>
    </div>

    <!-- Tab 3: 全局规则设置 -->
    <div v-show="activeTab === 'global'" class="tab-content">
      <div class="global-rules-section">
        <h3>全局规则设置</h3>
        <p class="section-desc">以下规则引用应用于所有角色和对话场景</p>

        <div class="form-group">
          <label>系统规则</label>
          <FileSelector
            v-model="characterStore.globalRuleRefs.systemRuleIds"
            file-type="rule"
            mode="multiple"
            placeholder="选择影响所有角色的系统规则"
          />
          <small>影响所有角色的基础行为方式和交流风格</small>
        </div>

        <div class="form-group">
          <label>对话规则</label>
          <FileSelector
            v-model="characterStore.globalRuleRefs.chatRuleIds"
            file-type="rule"
            mode="multiple"
            placeholder="选择普通对话的全局规则"
          />
          <small>普通对话模式下生效，规范对话输出</small>
        </div>

        <div class="form-group">
          <label>多人对话规则</label>
          <FileSelector
            v-model="characterStore.globalRuleRefs.dialogueRuleIds"
            file-type="rule"
            mode="multiple"
            placeholder="选择多角色对话的全局规则"
          />
          <small>多角色群聊模式下生效，规范各角色之间的互动</small>
        </div>

        <div class="button-group">
          <button class="btn btn-primary" @click.prevent="saveGlobalRuleRefs">保存全局规则</button>
          <span v-if="globalSaveStatus" :class="['save-status', 'success']">{{ globalSaveStatus }}</span>
        </div>
      </div>
    </div>

    <!-- ===== 角色分类对话框 ===== -->
    <FloatingWindow v-model:open="showAddCharCategory" title="添加角色分类" size="default">
      <div class="form-group">
        <label>分类名称</label>
        <input type="text" v-model="newCharCategoryName" placeholder="输入分类名称" @keyup.enter="doAddCharCategory" />
      </div>
      <template #footer>
        <button class="btn" @click="showAddCharCategory = false">取消</button>
        <button class="btn btn-primary" @click="doAddCharCategory" :disabled="!newCharCategoryName">添加</button>
      </template>
    </FloatingWindow>

    <FloatingWindow v-model:open="renamingCharCategoryOpen" title="重命名分类" size="default">
      <template v-if="renamingCharCategory">
        <div class="form-group">
          <label>新名称</label>
          <input type="text" v-model="renamingCharCategory.newName" @keyup.enter="doRenameCharCategory" />
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="renamingCharCategory = null">取消</button>
        <button class="btn btn-primary" @click="doRenameCharCategory">确定</button>
      </template>
    </FloatingWindow>

    <!-- 角色编辑/新建 Modal -->
    <FloatingWindow v-model:open="editingCharacterOpen" :title="editingCharacter?.id ? '编辑角色' : '新建角色'" size="large">
      <template v-if="editingCharacter">

        <div class="form-row avatar-row">
          <div class="avatar-upload" @click="openAvatarPicker">
            <img v-if="editForm.avatar_url" :src="editForm.avatar_url" alt="头像" />
            <span v-else class="avatar-placeholder">📷</span>
          </div>
          <div class="avatar-actions-inline">
            <button class="btn btn-sm" @click.prevent="openAvatarPicker">从图库选择</button>
            <ImageUploader
              mode="single"
              :crop-aspect="1"
              :force-crop="true"
              label="上传头像"
              @uploaded="onAvatarUploaded"
            />
          </div>
        </div>

        <div class="form-row inline-row">
          <div class="inline-field">
            <span class="inline-label">角色名称：</span>
            <input type="text" v-model="editForm.name" placeholder="AI角色的名字" />
          </div>
          <div class="inline-field">
            <span class="inline-label">性别：</span>
            <input type="text" v-model="editForm.gender" placeholder="男/女/其他" />
          </div>
          <div class="inline-field">
            <span class="inline-label">分类：</span>
            <select v-model="editForm.category_id">
              <option v-for="cat in characterStore.characterCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>人物属性</label>
          <textarea v-model="editForm.description" rows="6" placeholder="描述角色的外貌、性格、背景故事、特点等..."></textarea>
        </div>

        <div class="rules-section">
          <h4>规则引用</h4>
          <div class="form-group">
            <label>对话规则</label>
            <FileSelector
              v-model="editRuleRefs.chatRuleIds"
              file-type="rule"
              mode="multiple"
              placeholder="选择角色的对话规则文件（可被多个角色调用）"
            />
            <small>拖入的规则文件可被多个角色共享调用，修改文件即修改规则。</small>
          </div>
          <div class="form-group">
            <label>角色专属对话规则</label>
            <textarea
              v-model="editRuleRefs.chatRuleText"
              rows="5"
              placeholder="输入当前角色专属的对话规则（仅作用于该角色，与上方文件规则组合为完整对话规则）"
            ></textarea>
            <small>仅作用于当前角色，与上方拖入的规则文件组合为完整的对话规则。</small>
          </div>
        </div>

        <div class="config-section">
          <h4>开启功能</h4>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="editFuncConfig.enabled" />
              <span>开启功能</span>
            </label>
            <small>开启后，该角色在对话中可以根据"功能规则"主动调用功能库中的功能（如生图、图生视频等）</small>
          </div>

          <div v-if="editFuncConfig.enabled">
            <div class="form-group">
              <label>功能选择</label>
              <div class="function-select-list" v-if="characterStore.functions.length > 0">
                <div
                  v-for="fn in characterStore.functions"
                  :key="fn.id"
                  :class="['function-select-item', { selected: editFuncConfig.selectedFunctionIds.includes(fn.id) }]"
                  @click="toggleFunctionSelected(fn.id)"
                >
                  <div :class="['checkbox', { checked: editFuncConfig.selectedFunctionIds.includes(fn.id) }]"></div>
                  <div class="function-select-info">
                    <div class="function-select-name">{{ fn.name }}</div>
                    <div class="function-select-desc" v-if="fn.description">{{ fn.description }}</div>
                  </div>
                </div>
              </div>
              <small v-else>功能库暂无功能，请先到"功能库"页面新建功能</small>
              <small>已选 {{ editFuncConfig.selectedFunctionIds.length }} 个功能。一个角色可绑定多个功能，AI 会根据对话内容决定调用哪一个。</small>
            </div>

            <div class="form-group">
              <label>功能规则文件</label>
              <FileSelector
                v-model="editFuncConfig.functionRuleFileIds"
                file-type="rule"
                mode="multiple"
                placeholder="拖入规则文件，与下方输入框内容组合为功能规则"
              />
              <small>拖入的规则文件可被多个角色共享调用。</small>
            </div>

            <div class="form-group">
              <label>功能规则</label>
              <textarea
                v-model="editFuncConfig.functionRules"
                rows="6"
                :placeholder="characterStore.DEFAULT_FUNCTION_RULES"
              ></textarea>
              <small>拖入的规则文件内容 + 输入框文本 = 完整功能规则。留空则使用默认规则（见占位文本）。</small>
              <div class="rule-preset-actions">
                <button type="button" class="btn btn-sm" @click="editFuncConfig.functionRules = characterStore.DEFAULT_FUNCTION_RULES">使用默认规则</button>
                <button type="button" class="btn btn-sm" @click="editFuncConfig.functionRules = ''">清空</button>
              </div>
            </div>
          </div>
        </div>

      </template>
      <template #footer>
        <button class="btn" @click="closeCharacterEditor">取消</button>
        <button class="btn btn-primary" @click="saveCharacter" :disabled="!editForm.name?.trim()">保存</button>
      </template>
    </FloatingWindow>

    <!-- 角色移动分类 Modal -->
    <FloatingWindow v-model:open="movingCharacterOpen" title="移动到分类" size="default">
      <template v-if="movingCharacter">
        <div class="form-group">
          <label>目标分类</label>
          <select v-model="movingCharacter.targetCategoryId">
            <option v-for="cat in characterStore.characterCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="movingCharacter = null">取消</button>
        <button class="btn btn-primary" @click="doMoveCharacter">确定</button>
      </template>
    </FloatingWindow>

    <!-- 角色批量移动 Modal -->
    <FloatingWindow v-model:open="showCharBatchMove" title="批量移动角色到分类" size="default">
      <div class="form-group">
        <label>目标分类</label>
        <select v-model="charBatchMoveCategoryId">
          <option v-for="cat in characterStore.characterCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="showCharBatchMove = false">取消</button>
        <button class="btn btn-primary" @click="doCharBatchMove">确定</button>
      </template>
    </FloatingWindow>

    <!-- ===== 团队分类对话框 ===== -->
    <FloatingWindow v-model:open="showAddTeamCategory" title="添加团队分类" size="default">
      <div class="form-group">
        <label>分类名称</label>
        <input type="text" v-model="newTeamCategoryName" placeholder="输入分类名称" @keyup.enter="doAddTeamCategory" />
      </div>
      <template #footer>
        <button class="btn" @click="showAddTeamCategory = false">取消</button>
        <button class="btn btn-primary" @click="doAddTeamCategory" :disabled="!newTeamCategoryName">添加</button>
      </template>
    </FloatingWindow>

    <FloatingWindow v-model:open="renamingTeamCategoryOpen" title="重命名分类" size="default">
      <template v-if="renamingTeamCategory">
        <div class="form-group">
          <label>新名称</label>
          <input type="text" v-model="renamingTeamCategory.newName" @keyup.enter="doRenameTeamCategory" />
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="renamingTeamCategory = null">取消</button>
        <button class="btn btn-primary" @click="doRenameTeamCategory">确定</button>
      </template>
    </FloatingWindow>

    <!-- 团队编辑/新建 Modal -->
    <FloatingWindow v-model:open="editingTeamOpen" :title="editingTeam?.id ? '编辑团队' : '新建团队'" size="large">
      <template v-if="editingTeam">

        <div class="form-row">
          <div class="form-group">
            <label>团队名称</label>
            <input type="text" v-model="editTeamForm.name" placeholder="团队名称" />
          </div>
          <div class="form-group">
            <label>分类</label>
            <select v-model="editTeamForm.category_id">
              <option v-for="cat in characterStore.teamCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>描述</label>
          <input type="text" v-model="editTeamForm.description" placeholder="团队描述（可选）" />
        </div>

        <div class="members-section" v-if="editingTeam.id">
          <div class="section-header">
            <h4>成员管理</h4>
            <span class="member-count">{{ teamMembers.length }} 人</span>
          </div>

          <div class="member-list" v-if="teamMembers.length > 0">
            <div
              v-for="member in teamMembers"
              :key="member.character_id"
              :class="['member-item', { 'is-user': member.is_user, 'inactive': !member.is_active }]"
            >
              <div class="member-avatar">
                <img v-if="getMemberAvatar(member.character_id)" :src="getMemberAvatar(member.character_id)" alt="" />
                <span v-else>{{ getMemberName(member.character_id).charAt(0) }}</span>
              </div>
              <div class="member-info">
                <div class="member-name">
                  {{ getMemberName(member.character_id) }}
                  <span v-if="member.is_user" class="user-badge">我</span>
                </div>
              </div>
              <div class="member-actions">
                <label class="checkbox-label" :title="member.is_active ? '已激活' : '已禁用'">
                  <input
                    type="checkbox"
                    :checked="member.is_active"
                    @change="toggleMemberActive(editingTeam.id, member.character_id)"
                  />
                  <span>激活</span>
                </label>
                <button
                  :class="['btn', 'btn-sm', { 'btn-primary': member.is_user }]"
                  @click.prevent="setUserCharacter(editingTeam.id, member.character_id)"
                >{{ member.is_user ? '已设为"我"' : '设为"我"' }}</button>
                <button class="btn btn-danger-sm" @click.prevent="removeMember(editingTeam.id, member.character_id)">移除</button>
              </div>
            </div>
          </div>
          <div v-else class="empty-members">
            <p>团队暂无成员</p>
          </div>

          <div class="add-member-section">
            <h5>添加成员</h5>
            <div class="add-member-list" v-if="availableCharacters.length > 0">
              <div
                v-for="char in availableCharacters"
                :key="char.id"
                class="add-member-item"
                @click="addMember(editingTeam.id, char.id)"
              >
                <div class="member-avatar small">
                  <img v-if="getAvatarUrl(char)" :src="getAvatarUrl(char)" alt="" />
                  <span v-else>{{ (char.name || '?').charAt(0) }}</span>
                </div>
                <span>{{ char.name || '未命名' }}</span>
                <span class="add-icon">+</span>
              </div>
            </div>
            <p v-else class="empty-hint">所有角色已加入团队</p>
          </div>
        </div>

      </template>
      <template #footer>
        <button class="btn" @click="closeTeamEditor">取消</button>
        <button class="btn btn-primary" @click="saveTeam" :disabled="!editTeamForm.name?.trim()">保存</button>
      </template>
    </FloatingWindow>

    <!-- 团队移动分类 Modal -->
    <FloatingWindow v-model:open="movingTeamOpen" title="移动到分类" size="default">
      <template v-if="movingTeam">
        <div class="form-group">
          <label>目标分类</label>
          <select v-model="movingTeam.targetCategoryId">
            <option v-for="cat in characterStore.teamCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="movingTeam = null">取消</button>
        <button class="btn btn-primary" @click="doMoveTeam">确定</button>
      </template>
    </FloatingWindow>

    <!-- 团队批量移动 Modal -->
    <FloatingWindow v-model:open="showTeamBatchMove" title="批量移动团队到分类" size="default">
      <div class="form-group">
        <label>目标分类</label>
        <select v-model="teamBatchMoveCategoryId">
          <option v-for="cat in characterStore.teamCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="showTeamBatchMove = false">取消</button>
        <button class="btn btn-primary" @click="doTeamBatchMove">确定</button>
      </template>
    </FloatingWindow>

    <!-- 删除确认对话框（统一） -->
    <FloatingWindow v-model:open="deleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">{{ deleteConfirm.message }}</p>
      <template #footer>
        <button class="btn" @click="deleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDelete">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 头像选择器（从图库挑选） -->
    <FloatingWindow v-model:open="avatarPickerOpen" title="从艺术图库选择头像" size="large">
        <div class="gallery-picker-grid" v-if="galleryImages.length > 0">
          <div
            v-for="img in galleryImages"
            :key="img.id"
            class="picker-item"
            @click="selectAvatarFromGallery(img)"
          >
            <img v-if="img.thumbnail_data" :src="img.thumbnail_data" :alt="img.name" />
            <div v-else class="thumb-placeholder">无图</div>
            <div class="picker-name">{{ img.name }}</div>
          </div>
        </div>
        <div v-else class="empty-state">
          <p>图库暂无图片，请先到艺术图库上传</p>
        </div>
      <template #footer>
        <button class="btn" @click="avatarPickerOpen = false">取消</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useCharacterStore } from '@/stores/character'
import { useConfigStore } from '@/stores/config'
import FileSelector from '@/components/common/FileSelector.vue'
import ImageUploader from '@/components/common/ImageUploader.vue'
import { apiClient } from '@/services/api'
import { useGalleryStore } from '@/stores/gallery'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const characterStore = useCharacterStore()
const configStore = useConfigStore()
const galleryStore = useGalleryStore()

const activeTab = ref('character')
const globalSaveStatus = ref('')

// === 角色分类 ===
const charActiveCategory = ref('all')
const charSearchQuery = ref('')
const charSelectedIds = ref([])
const showAddCharCategory = ref(false)
const newCharCategoryName = ref('')
const renamingCharCategory = ref(null)
const showCharBatchMove = ref(false)
const charBatchMoveCategoryId = ref(null)

// === 团队分类 ===
const teamActiveCategory = ref('all')
const teamSearchQuery = ref('')
const teamSelectedIds = ref([])
const showAddTeamCategory = ref(false)
const newTeamCategoryName = ref('')
const renamingTeamCategory = ref(null)
const showTeamBatchMove = ref(false)
const teamBatchMoveCategoryId = ref(null)

// 切换分类时清空勾选
function switchCharCategory(catId) {
  charActiveCategory.value = catId
  charSelectedIds.value = []
}
function switchTeamCategory(catId) {
  teamActiveCategory.value = catId
  teamSelectedIds.value = []
}

// === 角色编辑 ===
const editingCharacter = ref(null)
const editForm = reactive({
  name: '',
  avatar_url: '',
  gender: '',
  description: '',
  category_id: 0
})
const editRuleRefs = reactive({ chatRuleIds: [], chatRuleText: '' })
const editFuncConfig = reactive({
  enabled: false,
  selectedFunctionIds: [],
  functionRules: '',
  functionRuleFileIds: []
})

// === 生图工作流（使用 FileSelector 通用组件，从可调用文件夹加载） ===

const movingCharacter = ref(null)

// === 团队编辑 ===
const editingTeam = ref(null)
const editTeamForm = reactive({ name: '', description: '', category_id: 0 })
const movingTeam = ref(null)

// === 删除确认 ===
const deleteConfirm = ref({ show: false, type: '', target: null, message: '' })

// === 头像选择器 ===
const avatarPickerOpen = ref(false)

// FloatingWindow open proxies
const renamingCharCategoryOpen = computed({
  get: () => !!renamingCharCategory.value,
  set: (v) => { if (!v) renamingCharCategory.value = null }
})
const editingCharacterOpen = computed({
  get: () => !!editingCharacter.value,
  set: (v) => { if (!v) closeCharacterEditor() }
})
const movingCharacterOpen = computed({
  get: () => !!movingCharacter.value,
  set: (v) => { if (!v) movingCharacter.value = null }
})
const renamingTeamCategoryOpen = computed({
  get: () => !!renamingTeamCategory.value,
  set: (v) => { if (!v) renamingTeamCategory.value = null }
})
const editingTeamOpen = computed({
  get: () => !!editingTeam.value,
  set: (v) => { if (!v) closeTeamEditor() }
})
const movingTeamOpen = computed({
  get: () => !!movingTeam.value,
  set: (v) => { if (!v) movingTeam.value = null }
})
const deleteConfirmOpen = computed({
  get: () => deleteConfirm.value.show,
  set: (v) => { if (!v) deleteConfirm.value.show = false }
})

const galleryImages = computed(() => galleryStore.images)

const filteredCharacters = computed(() => {
  let list = characterStore.charactersByCategory(charActiveCategory.value)
  if (charSearchQuery.value.trim()) {
    const q = charSearchQuery.value.toLowerCase()
    list = list.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q)
    )
  }
  return list
})

const filteredTeams = computed(() => {
  let list = characterStore.teamsByCategory(teamActiveCategory.value)
  if (teamSearchQuery.value.trim()) {
    const q = teamSearchQuery.value.toLowerCase()
    list = list.filter(t => t.name?.toLowerCase().includes(q))
  }
  return list
})

const charAllSelected = computed(() =>
  filteredCharacters.value.length > 0 && filteredCharacters.value.every(c => charSelectedIds.value.includes(c.id))
)

const teamAllSelected = computed(() =>
  filteredTeams.value.length > 0 && filteredTeams.value.every(t => teamSelectedIds.value.includes(t.id))
)

const teamMembers = computed(() => {
  if (!editingTeam.value?.id) return []
  const team = characterStore.teams.find(t => t.id === editingTeam.value.id)
  if (!team) return []
  try { return JSON.parse(team.member_config || '[]') } catch { return [] }
})

const availableCharacters = computed(() => {
  const memberIds = teamMembers.value.map(m => m.character_id)
  return characterStore.characters.filter(c => !memberIds.includes(c.id))
})

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch { return dateStr }
}

function getAvatarUrl(char) {
  return char?.avatar_url || char?.avatar || ''
}

function getMemberCount(team) {
  try { return JSON.parse(team.member_config || '[]').length } catch { return 0 }
}

function getMemberName(id) { return characterStore.getCharacterName(id) }
function getMemberAvatar(id) { return characterStore.getCharacterAvatar(id) }

// === 选择操作 ===
function toggleCharSelect(id) {
  const i = charSelectedIds.value.indexOf(id)
  if (i > -1) charSelectedIds.value.splice(i, 1)
  else charSelectedIds.value.push(id)
}

function toggleCharSelectAll() {
  if (charAllSelected.value) {
    charSelectedIds.value = charSelectedIds.value.filter(id => !filteredCharacters.value.some(c => c.id === id))
  } else {
    filteredCharacters.value.forEach(c => {
      if (!charSelectedIds.value.includes(c.id)) charSelectedIds.value.push(c.id)
    })
  }
}

function toggleTeamSelect(id) {
  const i = teamSelectedIds.value.indexOf(id)
  if (i > -1) teamSelectedIds.value.splice(i, 1)
  else teamSelectedIds.value.push(id)
}

function toggleTeamSelectAll() {
  if (teamAllSelected.value) {
    teamSelectedIds.value = teamSelectedIds.value.filter(id => !filteredTeams.value.some(t => t.id === id))
  } else {
    filteredTeams.value.forEach(t => {
      if (!teamSelectedIds.value.includes(t.id)) teamSelectedIds.value.push(t.id)
    })
  }
}

// === 角色分类操作 ===
async function doAddCharCategory() {
  if (!newCharCategoryName.value.trim()) return
  await characterStore.createCharacterCategory(newCharCategoryName.value.trim())
  newCharCategoryName.value = ''
  showAddCharCategory.value = false
}

function renameCharCategory(cat) {
  renamingCharCategory.value = { id: cat.id, newName: cat.name }
}

async function doRenameCharCategory() {
  if (!renamingCharCategory.value?.newName.trim()) return
  await characterStore.updateCharacterCategory(renamingCharCategory.value.id, { name: renamingCharCategory.value.newName.trim() })
  renamingCharCategory.value = null
}

function confirmDeleteCharCategory(cat) {
  deleteConfirm.value = {
    show: true, type: 'charCategory', target: cat,
    message: `确定删除分类"${cat.name}"吗？\n分类下的角色将移到"未分类"。`
  }
}

// === 角色操作 ===
function startCreateCharacter() {
  const defaultCatId = charActiveCategory.value !== 'all'
    ? charActiveCategory.value
    : (characterStore.characterCategories[0]?.id || 0)
  editingCharacter.value = { id: null }
  editForm.name = `新角色${characterStore.characters.length + 1}`
  editForm.avatar_url = ''
  editForm.gender = ''
  editForm.description = ''
  editForm.category_id = defaultCatId
  editRuleRefs.chatRuleIds = []
  editRuleRefs.chatRuleText = ''
  editFuncConfig.enabled = false
  editFuncConfig.selectedFunctionIds = []
  editFuncConfig.functionRules = ''
  editFuncConfig.functionRuleFileIds = []
}

function editCharacter(char) {
  editingCharacter.value = { id: char.id }
  editForm.name = char.name || ''
  editForm.avatar_url = char.avatar_url || ''
  editForm.gender = char.gender || ''
  editForm.description = char.description || ''
  editForm.category_id = char.category_id || 0
  const refs = characterStore.parseCharRuleRefs(char)
  editRuleRefs.chatRuleIds = [...refs.chatRuleIds]
  editRuleRefs.chatRuleText = refs.chatRuleText || ''
  const func = characterStore.parseCharFuncConfig(char)
  editFuncConfig.enabled = func.enabled
  editFuncConfig.selectedFunctionIds = [...func.selectedFunctionIds]
  editFuncConfig.functionRules = func.functionRules
  editFuncConfig.functionRuleFileIds = [...func.functionRuleFileIds]
}

function closeCharacterEditor() {
  editingCharacter.value = null
}

function toggleFunctionSelected(fnId) {
  const i = editFuncConfig.selectedFunctionIds.indexOf(fnId)
  if (i > -1) editFuncConfig.selectedFunctionIds.splice(i, 1)
  else editFuncConfig.selectedFunctionIds.push(fnId)
}

async function saveCharacter() {
  if (!editForm.name?.trim()) return
  const payload = {
    name: editForm.name.trim(),
    avatar_url: editForm.avatar_url,
    gender: editForm.gender,
    description: editForm.description,
    category_id: editForm.category_id,
    rule_refs: JSON.stringify({
      chatRuleIds: editRuleRefs.chatRuleIds,
      chatRuleText: editRuleRefs.chatRuleText
    }),
    function_config: JSON.stringify({
      enabled: editFuncConfig.enabled,
      selectedFunctionIds: editFuncConfig.selectedFunctionIds,
      functionRules: editFuncConfig.functionRules,
      functionRuleFileIds: editFuncConfig.functionRuleFileIds
    })
  }
  if (editingCharacter.value.id) {
    await characterStore.updateCharacter(editingCharacter.value.id, payload)
  } else {
    await characterStore.createCharacter(payload)
  }
  closeCharacterEditor()
}

function moveCharacter(char) {
  movingCharacter.value = { id: char.id, targetCategoryId: char.category_id || 0 }
}

async function doMoveCharacter() {
  if (!movingCharacter.value) return
  await characterStore.updateCharacter(movingCharacter.value.id, { category_id: movingCharacter.value.targetCategoryId })
  movingCharacter.value = null
}

function confirmDeleteCharacter(char) {
  deleteConfirm.value = {
    show: true, type: 'character', target: char,
    message: `确定删除角色"${char.name || '未命名'}"吗？\n该角色将从所有团队中移除。`
  }
}

function confirmBatchDeleteCharacters() {
  deleteConfirm.value = {
    show: true, type: 'charBatch', target: null,
    message: `确定删除选中的 ${charSelectedIds.value.length} 个角色吗？`
  }
}

async function doCharBatchMove() {
  if (charBatchMoveCategoryId.value === null) return
  // 逐个更新（后端没有批量接口）
  for (const id of charSelectedIds.value) {
    await characterStore.updateCharacter(id, { category_id: charBatchMoveCategoryId.value })
  }
  charSelectedIds.value = []
  showCharBatchMove.value = false
}

// === 团队分类操作 ===
async function doAddTeamCategory() {
  if (!newTeamCategoryName.value.trim()) return
  await characterStore.createTeamCategory(newTeamCategoryName.value.trim())
  newTeamCategoryName.value = ''
  showAddTeamCategory.value = false
}

function renameTeamCategory(cat) {
  renamingTeamCategory.value = { id: cat.id, newName: cat.name }
}

async function doRenameTeamCategory() {
  if (!renamingTeamCategory.value?.newName.trim()) return
  await characterStore.updateTeamCategory(renamingTeamCategory.value.id, { name: renamingTeamCategory.value.newName.trim() })
  renamingTeamCategory.value = null
}

function confirmDeleteTeamCategory(cat) {
  deleteConfirm.value = {
    show: true, type: 'teamCategory', target: cat,
    message: `确定删除分类"${cat.name}"吗？\n分类下的团队将移到"未分类"。`
  }
}

// === 团队操作 ===
function startCreateTeam() {
  const defaultCatId = teamActiveCategory.value !== 'all'
    ? teamActiveCategory.value
    : (characterStore.teamCategories[0]?.id || 0)
  editingTeam.value = { id: null }
  editTeamForm.name = `新团队${characterStore.teams.length + 1}`
  editTeamForm.description = ''
  editTeamForm.category_id = defaultCatId
}

function editTeam(team) {
  editingTeam.value = { id: team.id }
  editTeamForm.name = team.name || ''
  editTeamForm.description = team.description || ''
  editTeamForm.category_id = team.category_id || 0
}

function closeTeamEditor() {
  editingTeam.value = null
}

async function saveTeam() {
  if (!editTeamForm.name?.trim()) return
  const payload = {
    name: editTeamForm.name.trim(),
    description: editTeamForm.description,
    category_id: editTeamForm.category_id
  }
  if (editingTeam.value.id) {
    await characterStore.updateTeam(editingTeam.value.id, payload)
  } else {
    await characterStore.createTeam(editTeamForm.name.trim())
    // 创建后再更新分类和描述
    const newTeam = characterStore.teams[characterStore.teams.length - 1]
    if (newTeam) {
      await characterStore.updateTeam(newTeam.id, payload)
    }
  }
  closeTeamEditor()
}

function moveTeam(team) {
  movingTeam.value = { id: team.id, targetCategoryId: team.category_id || 0 }
}

async function doMoveTeam() {
  if (!movingTeam.value) return
  await characterStore.updateTeam(movingTeam.value.id, { category_id: movingTeam.value.targetCategoryId })
  movingTeam.value = null
}

function confirmDeleteTeam(team) {
  deleteConfirm.value = {
    show: true, type: 'team', target: team,
    message: `确定删除团队"${team.name || '未命名'}"吗？`
  }
}

function confirmBatchDeleteTeams() {
  deleteConfirm.value = {
    show: true, type: 'teamBatch', target: null,
    message: `确定删除选中的 ${teamSelectedIds.value.length} 个团队吗？`
  }
}

async function doTeamBatchMove() {
  if (teamBatchMoveCategoryId.value === null) return
  for (const id of teamSelectedIds.value) {
    await characterStore.updateTeam(id, { category_id: teamBatchMoveCategoryId.value })
  }
  teamSelectedIds.value = []
  showTeamBatchMove.value = false
}

// === 团队成员操作（在编辑 Modal 内） ===
async function addMember(teamId, characterId) {
  const team = characterStore.teams.find(t => t.id === teamId)
  if (!team) return
  const members = JSON.parse(team.member_config || '[]')
  if (members.some(m => m.character_id === characterId)) return
  members.push({ character_id: characterId, is_active: true, is_user: false })
  await characterStore.updateTeam(teamId, { member_config: members })
}

async function removeMember(teamId, characterId) {
  const team = characterStore.teams.find(t => t.id === teamId)
  if (!team) return
  const members = JSON.parse(team.member_config || '[]').filter(m => m.character_id !== characterId)
  await characterStore.updateTeam(teamId, { member_config: members })
}

async function toggleMemberActive(teamId, characterId) {
  const team = characterStore.teams.find(t => t.id === teamId)
  if (!team) return
  const members = JSON.parse(team.member_config || '[]').map(m =>
    m.character_id === characterId ? { ...m, is_active: !m.is_active } : m
  )
  await characterStore.updateTeam(teamId, { member_config: members })
}

async function setUserCharacter(teamId, characterId) {
  const team = characterStore.teams.find(t => t.id === teamId)
  if (!team) return
  const members = JSON.parse(team.member_config || '[]').map(m => ({
    ...m,
    is_user: m.character_id === characterId ? !m.is_user : false
  }))
  await characterStore.updateTeam(teamId, { member_config: members })
}

// === 删除统一处理 ===
async function doDelete() {
  const { type, target } = deleteConfirm.value
  if (type === 'charCategory') {
    await characterStore.deleteCharacterCategory(target.id)
  } else if (type === 'teamCategory') {
    await characterStore.deleteTeamCategory(target.id)
  } else if (type === 'character') {
    await characterStore.deleteCharacter(target.id)
    charSelectedIds.value = charSelectedIds.value.filter(id => id !== target.id)
  } else if (type === 'charBatch') {
    for (const id of [...charSelectedIds.value]) {
      await characterStore.deleteCharacter(id)
    }
    charSelectedIds.value = []
  } else if (type === 'team') {
    if (characterStore.teams.length <= 1) {
      alert('至少保留一个团队')
      deleteConfirm.value.show = false
      return
    }
    await characterStore.deleteTeam(target.id)
    teamSelectedIds.value = teamSelectedIds.value.filter(id => id !== target.id)
  } else if (type === 'teamBatch') {
    if (characterStore.teams.length - teamSelectedIds.value.length < 1) {
      alert('至少保留一个团队')
      deleteConfirm.value.show = false
      return
    }
    for (const id of [...teamSelectedIds.value]) {
      await characterStore.deleteTeam(id)
    }
    teamSelectedIds.value = []
  }
  deleteConfirm.value.show = false
}

// === 头像选择 ===
function openAvatarPicker() {
  // 加载图库
  if (galleryStore.images.length === 0) {
    galleryStore.loadAll()
  }
  avatarPickerOpen.value = true
}

async function selectAvatarFromGallery(img) {
  // 直接使用缩略图 base64（图库中已存储，300px 足够头像使用）
  if (img.thumbnail_data) {
    editForm.avatar_url = img.thumbnail_data
  }
  avatarPickerOpen.value = false
}

async function onAvatarUploaded(base64) {
  // ImageUploader single 模式返回 base64 string
  editForm.avatar_url = base64
  // 同时将裁切后的头像保存到文件库：
  //   优先保存到用户的可调用文件夹（is_callable=1）；
  //   若未设置任何可调用文件夹，则落到总库根目录（is_system=1 的分类，folder_id=null）。
  try {
    const thumb = await galleryStore.generateThumbnail(base64)
    let targetCategoryId = null
    let targetFolderId = null

    // 1. 查找可调用文件夹（取第一个）
    const allFolders = await apiClient.getFileLibraryFolders({ parent_id: 'all' })
    const callableFolder = (allFolders || []).find(f => f.is_callable === 1 || f.is_callable === true)
    if (callableFolder) {
      targetCategoryId = callableFolder.category_id
      targetFolderId = callableFolder.id
    } else {
      // 2. 没有可调用文件夹 → 使用总库根目录
      const categories = await apiClient.getFileLibraryCategories()
      const zongkuCat = (categories || []).find(c => c.is_system === 1 || c.is_system === true)
      targetCategoryId = zongkuCat ? zongkuCat.id : ((categories || [])[0] && categories[0].id) || null
      targetFolderId = null
    }

    if (targetCategoryId) {
      await apiClient.createFileLibraryFile({
        category_id: targetCategoryId,
        folder_id: targetFolderId,
        name: `头像_${Date.now()}`,
        file_type: 'image',
        image_base64: base64,
        thumbnail_base64: thumb,
        format: 'png',
        file_size: 0
      })
    } else {
      console.error('保存头像到文件库失败: 未找到目标分类')
    }
  } catch (e) {
    console.error('保存头像到文件库失败:', e)
  }
}

async function saveGlobalRuleRefs() {
  try {
    await characterStore.saveGlobalRuleRefs()
    globalSaveStatus.value = '保存成功'
    setTimeout(() => { globalSaveStatus.value = '' }, 2000)
  } catch (e) {
    alert('保存全局规则失败: ' + e.message)
  }
}

onMounted(() => {
  if (!characterStore.characters.length) {
    characterStore.loadAll()
  }
  configStore.loadAiConfigs()
  configStore.loadAiConfigCategories()
})
</script>

<style scoped>
.character-panel {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
}

.character-panel h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-desc {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 0 0 16px 0;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  padding: 4px;
  background: var(--bg-surface);
  border-radius: 10px;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.tab-item:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.tab-item.active {
  background: var(--accent-color);
  color: var(--accent-text);
}

.tab-content {
  min-height: 300px;
}

/* === 分类标签栏（统一 JsonManager 风格） === */
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

/* === 工具栏 === */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left, .toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
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

/* === 列表（统一 JsonManager 风格） === */
.entity-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
}

.list-header, .list-row {
  display: grid;
  grid-template-columns: 40px 50px 1fr 70px 100px 110px 160px;
  align-items: center;
  padding: 10px 12px;
  gap: 8px;
}

.list-header {
  background: var(--bg-secondary);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128,128,128,0.1));
}

.list-row {
  font-size: 13px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128,128,128,0.05));
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

.col-avatar {
  display: flex;
  justify-content: center;
}

.row-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg-tertiary, #ddd);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
}

.row-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.col-name {
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.col-name:hover {
  color: var(--accent-color);
}

.col-gender, .col-members {
  font-size: 12px;
  color: var(--text-secondary);
}

.col-cat {
  font-size: 12px;
  color: var(--text-secondary);
}

.col-date {
  font-size: 12px;
  color: var(--text-muted);
}

.col-actions {
  display: flex;
  gap: 4px;
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

.btn-icon-sm:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--accent-color);
}

.btn-icon-sm.danger:hover {
  background: #fee2e2;
  color: #ef4444;
  border-color: #ef4444;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

/* === Buttons === */
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

.btn-danger-sm {
  padding: 4px 10px;
  font-size: 12px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

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

.form-group input,
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

.form-group textarea {
  resize: vertical;
  font-family: inherit;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

/* === 头像选择区 === */
.avatar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.avatar-upload {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 2px dashed var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
}

.avatar-upload img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 28px;
}

.avatar-actions-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* === 行内字段（文字：输入框） === */
.inline-row {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.inline-field {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 180px;
}

.inline-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.inline-field input,
.inline-field select {
  flex: 1;
  min-width: 0;
}

/* === 规则引用与配置区 === */
.rules-section, .config-section {
  background: var(--bg-surface);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 14px;
}

.rules-section h4, .config-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-bottom: 0 !important;
  font-weight: 500 !important;
}

.checkbox-label input[type="checkbox"] {
  width: auto;
  margin: 0;
}

.checkbox-label span {
  font-size: 13px;
  color: var(--text-primary);
}

small {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.ai-override-form {
  margin-top: 12px;
}

/* === 生图工作流筛选区（参考 TaskManager 的 filter-bar） === */
.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-select {
  padding: 6px 10px;
  background: var(--bg-surface);
  border: none;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  box-shadow: var(--input-shadow);
}

.filter-search {
  flex: 1;
  min-width: 120px;
  padding: 6px 10px;
  background: var(--bg-surface);
  border: none;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  box-shadow: var(--input-shadow);
}

.json-select-list {
  max-height: 240px;
  overflow-y: auto;
  background: var(--bg-surface);
  border-radius: 8px;
  padding: 6px;
}

.json-select-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.json-select-item:hover {
  background: var(--bg-secondary);
}

.json-select-item.selected {
  background: rgba(74, 158, 255, 0.1);
}

.item-name {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.button-group {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.save-status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}

.save-status.success {
  color: #4CAF50;
  background: rgba(76, 175, 80, 0.1);
}

/* === 团队成员管理 === */
.members-section {
  background: var(--bg-surface);
  border-radius: 10px;
  padding: 16px;
  margin-top: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header h4 {
  margin: 0;
  font-size: 14px;
}

.member-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.member-item.inactive {
  opacity: 0.5;
}

.member-item.is-user {
  background: rgba(74, 158, 255, 0.1);
}

.member-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-tertiary, #ddd);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  overflow: hidden;
  flex-shrink: 0;
}

.member-avatar.small {
  width: 28px;
  height: 28px;
  font-size: 12px;
}

.member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.member-info {
  flex: 1;
}

.member-name {
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.user-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--accent-color);
  color: var(--accent-text);
  border-radius: 8px;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-members {
  text-align: center;
  padding: 20px;
  color: var(--text-muted);
  font-size: 13px;
}

.add-member-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--bg-tertiary, rgba(128,128,128,0.1));
}

.add-member-section h5 {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.add-member-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.add-member-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.add-member-item:hover {
  background: var(--bg-primary);
}

.add-icon {
  color: var(--accent-color);
  font-weight: 600;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  padding: 8px;
}

.fw-confirm-msg {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-line;
  line-height: 1.6;
}

/* === 全局规则 === */
.global-rules-section {
  background: var(--bg-surface);
  border-radius: 10px;
  padding: 20px;
}

.global-rules-section h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

/* === 图库选择器 === */
.gallery-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  max-height: 60vh;
  overflow-y: auto;
}

.picker-item {
  background: var(--bg-surface);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
  border: 2px solid transparent;
}

.picker-item:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
}

.picker-item img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}

.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  background: var(--bg-secondary);
  color: var(--text-muted);
  font-size: 13px;
}

.picker-name {
  padding: 6px 8px;
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* === 功能选择列表 === */
.function-select-list {
  max-height: 240px;
  overflow-y: auto;
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.function-select-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.function-select-item:hover {
  background: var(--bg-surface);
}

.function-select-item.selected {
  background: rgba(74, 158, 255, 0.1);
}

.function-select-item .checkbox {
  flex-shrink: 0;
}

.function-select-info {
  flex: 1;
  overflow: hidden;
}

.function-select-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.function-select-desc {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-preset-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
