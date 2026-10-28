export const defaultWorkflow = {
  "79": {
    "inputs": {
      "unet_name": "Zimage\\redcraftMar0826LatestZib_fp8_zibDistilled.safetensors",
      "weight_dtype": "default"
    },
    "class_type": "UNETLoader",
    "_meta": {
      "title": "UNet加载器"
    }
  },
  "80": {
    "inputs": {
      "clip_name": "qwen_3_4b.safetensors",
      "type": "lumina2",
      "device": "default"
    },
    "class_type": "CLIPLoader",
    "_meta": {
      "title": "加载CLIP"
    }
  },
  "82": {
    "inputs": {
      "samples": [
        "138",
        0
      ],
      "vae": [
        "86",
        0
      ]
    },
    "class_type": "VAEDecode",
    "_meta": {
      "title": "VAE解码"
    }
  },
  "83": {
    "inputs": {
      "filename_prefix": "ComfyUI",
      "images": [
        "82",
        0
      ]
    },
    "class_type": "SaveImage",
    "_meta": {
      "title": "保存图像"
    }
  },
  "84": {
    "inputs": {
      "width": [
        "145",
        0
      ],
      "height": [
        "146",
        0
      ],
      "batch_size": 1
    },
    "class_type": "EmptyLatentImage",
    "_meta": {
      "title": "空Latent图像"
    }
  },
  "85": {
    "inputs": {
      "text": [
        "106",
        0
      ],
      "clip": [
        "80",
        0
      ]
    },
    "class_type": "CLIPTextEncode",
    "_meta": {
      "title": "CLIP文本编码"
    }
  },
  "86": {
    "inputs": {
      "vae_name": "ae.safetensors"
    },
    "class_type": "VAELoader",
    "_meta": {
      "title": "加载VAE"
    }
  },
  "93": {
    "inputs": {
      "conditioning": [
        "85",
        0
      ]
    },
    "class_type": "ConditioningZeroOut",
    "_meta": {
      "title": "条件零化"
    }
  },
  "106": {
    "inputs": {
      "inputcount": 2,
      "delimiter": " ",
      "return_list": false,
      "Update inputs": null,
      "string_1": [
        "107",
        0
      ],
      "string_2": [
        "109",
        0
      ]
    },
    "class_type": "JoinStringMulti",
    "_meta": {
      "title": "Join String Multi"
    }
  },
  "107": {
    "inputs": {
      "text": ""
    },
    "class_type": "Text Multiline",
    "_meta": {
      "title": "Text Multiline"
    }
  },
  "108": {
    "inputs": {
      "text": "",
      "anything": [
        "106",
        0
      ]
    },
    "class_type": "easy showAnything",
    "_meta": {
      "title": "展示任何"
    }
  },
  "109": {
    "inputs": {
      "text": ""
    },
    "class_type": "Text Multiline",
    "_meta": {
      "title": "字"
    }
  },
  "138": {
    "inputs": {
      "add_noise": "enable",
      "noise_seed": 470498628554951,
      "steps": 6,
      "cfg": 1,
      "sampler_name": "euler",
      "scheduler": "simple",
      "start_at_step": 0,
      "end_at_step": 10000,
      "return_with_leftover_noise": "disable",
      "model": [
        "79",
        0
      ],
      "positive": [
        "85",
        0
      ],
      "negative": [
        "93",
        0
      ],
      "latent_image": [
        "84",
        0
      ]
    },
    "class_type": "KSamplerAdvanced",
    "_meta": {
      "title": "K采样器（高级）"
    }
  },
  "145": {
    "inputs": {
      "value": 720
    },
    "class_type": "INTConstant",
    "_meta": {
      "title": "INT Constant"
    }
  },
  "146": {
    "inputs": {
      "value": 1024
    },
    "class_type": "INTConstant",
    "_meta": {
      "title": "INT Constant"
    }
  }
}

export const defaultCharacter = {
  name: '',
  avatar: '',
  description: '',
  behaviorRules: '',
  imageRules: '',
  chatRules: ''
}

export const defaultGlobalRules = {
  systemRules: '',
  imageRules: '',
  chatRules: '',
  dialogueRules: ''
}

export const navGroups = [
  {
    id: 'settings',
    name: '设置',
    children: [
      { id: 'settings', name: 'API配置' },
      { id: 'comfyui', name: 'ComfyUI配置' },
      { id: 'storyboard-parser', name: '分镜生成' }
    ]
  },
  {
    id: 'library',
    name: '库',
    children: [
      { id: 'gallery', name: '文件库' },
      { id: 'character', name: '角色库' },
      { id: 'single', name: '功能库' },
      { id: 'tag', name: '标签库' }
    ]
  },
  {
    id: 'task',
    name: '任务',
    children: [
      { id: 'task-running', name: '执行中的任务' },
      { id: 'task-done', name: '已完成的任务' },
      { id: 'task', name: '任务库' }
    ]
  },
  {
    id: 'ui',
    name: 'UI界面',
    children: null
  },
  {
    id: 'chat',
    name: 'AI对话',
    children: null
  }
]

export const navItems = [
  { id: 'settings', name: '设置' },
  { id: 'gallery', name: '文件库' },
  { id: 'tag', name: '标签库' },
  { id: 'character', name: '角色库' },
  { id: 'single', name: '功能库' },
  { id: 'task', name: '任务库' },
  { id: 'ui', name: 'UI管理' },
  { id: 'chat', name: '对话' }
]
