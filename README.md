# HTX Creative Toolkit

HTX 创意工具聚合页，统一提供两套完整、自包含的 Agent Skills：

- `downloads/*.skill`：Codex 安装包，包根包含 `SKILL.md` 与该 Skill 所需的完整资源
- `downloads/*.zip`：Claude Code、Cursor 等环境使用的通用包，解压后保留顶层 Skill 文件夹
- `skills/`：两套 Skill 的可审计源目录；火宝 Skill 内置自动出图脚本，品牌 Skill 统一覆盖普通社媒与复杂品牌物料
- HTX 运营视觉工作台入口

Claude Code 项目级安装示例：

```text
.claude/skills/htx-brand/
├── SKILL.md
├── assets/
└── references/
```

必须复制完整目录，不能只复制 `SKILL.md`。运行 `scripts/build-packages.sh` 可从 `skills/` 重建全部下载包并自动验证文件完整性、目录层级和本机绝对路径。

线上页面：<https://nikoyam303-alt.github.io/HTX-skill/>

工作台：<https://nikoyam303-alt.github.io/htx-creativeos/>
