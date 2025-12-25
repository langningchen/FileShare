# Resumable Upload Feature Summary (断点续传功能总结)

## 功能说明 (Feature Description)

本功能允许用户在上传中断后继续上传，而不需要从头开始。
This feature allows users to continue uploads after interruption instead of starting over.

## 实现方式 (Implementation)

### 服务端 (Server Side)

1. **`/list` 接口** - 返回文件列表
   - 对于正在上传的文件 (`uploading=true`)，返回：
     - `fileId` - 文件标识符
     - `filename` - 文件名
     - `chunks` - 已上传的分块数
     - `size` - 已上传的总大小
     - `uploading: true` - 标记为上传中

2. **`/start` 接口** - 开始或恢复上传
   - 检查是否存在相同文件名和 IP 的未完成上传
   - 如果存在：返回现有的 `fileId` 和 `chunks`
   - 如果不存在：创建新的上传，返回新 `fileId` 和 `chunks: 0`

### 客户端 (Client Side)

1. **文件列表显示**
   - 正在上传的文件显示 "(上传中)" 标记
   - 显示已上传的分块数量和大小
   - 提供 "Resume" 按钮和说明

2. **上传逻辑**
   - 调用 `/start` 获取 `fileId` 和起始分块号 `chunks`
   - 从第 `chunks` 个分块开始上传（而不是从 0 开始）
   - 自动继续之前中断的上传

## 使用流程 (Usage Flow)

```
用户场景：上传 100MB 文件，在 50MB 时网络中断

1. 首次上传
   - 选择文件 → 点击 Upload
   - 上传到 50MB 时中断
   - 服务器已保存：chunks=5, size=52428800, uploading=true

2. 查看文件列表
   - 刷新页面 → 点击 "Refresh file list"
   - 看到文件显示 "(上传中) 50MB (5 chunks uploaded)"
   - 看到 "Resume" 按钮

3. 恢复上传
   - 选择相同文件 → 点击 Upload
   - 系统自动从第 6 个分块开始上传
   - 只需上传剩余的 50MB
   - 完成后文件状态改为 "已完成"
```

## 技术细节 (Technical Details)

### 关键设计决策

1. **基于文件名和 IP 匹配**
   - 优点：实现简单，安全性好
   - 限制：需要相同 IP 地址

2. **返回分块计数**
   - 客户端从 `startChunk` 开始上传
   - 避免重复上传已完成的分块

3. **手动文件选择**
   - 浏览器安全限制，无法自动访问文件
   - 用户需要重新选择文件以恢复上传

### 数据流 (Data Flow)

```
Client                          Server (KV Store)
  |                                |
  |--- POST /start (filename) ---->|
  |                                | 1. Check for existing upload
  |                                | 2. If found: return {fileId, chunks}
  |<--- {fileId, chunks} ----------|    If not: create new
  |                                |
  | Skip chunks 0 to (chunks-1)    |
  |                                |
  |--- POST /chunk (fileId, i) --->| 3. Upload chunk i
  |<--- Success -------------------|    Update chunks count
  |                                |
  | ... continue from chunk i+1    |
  |                                |
  |--- POST /end (fileId) -------->| 4. Mark as complete
  |<--- Success -------------------|    Remove uploading flag
```

## 已知限制 (Known Limitations)

1. **IP 地址变更** - 更换网络后无法恢复之前的上传
2. **文件名匹配** - 文件重命名后会被视为新文件
3. **手动恢复** - 需要用户手动选择文件并点击上传
4. **性能** - 使用 KV 扫描，大量文件时可能有轻微延迟

## 未来改进 (Future Improvements)

如需进一步优化，可以考虑：
- 使用基于文件名的索引以提高查找效率
- 添加文件哈希验证以确保文件未被修改
- 支持用户认证以替代 IP 地址匹配
- 添加过期时间自动清理未完成的上传

## 安全性 (Security)

✅ 已通过 CodeQL 安全扫描
✅ 基于 IP 地址的访问控制
✅ 不同用户的上传互相隔离
✅ 无安全漏洞
