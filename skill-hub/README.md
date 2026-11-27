# Luma Skill Hub

企业自托管 Skill 库。团队可发布、审核、查找、下载适用版本，并管理空间成员、API Token 和审计记录。界面沿用 LumaSkill 工作台，支持简体中文、English 和浅色／深色主题。

## 本地运行

在本目录执行。需要 Docker Engine 和 Compose v2。新实例先从示例创建配置，设置管理员口令。下列命令把端口限定在本机，服务器、数据库、Redis 和扫描器使用固定版本的发布镜像。

```sh
cp .env.release.example .env.release
chmod 600 .env.release
```

在 `.env.release` 内修改以下配置。将示例中的管理员、数据库等默认口令更换为自己的值。复用既有实例时，继续使用原配置和 Compose 项目名。

```dotenv
SKILLHUB_VERSION=v0.2.28
WEB_PORT=127.0.0.1:18080
API_PORT=127.0.0.1:18081
POSTGRES_BIND_ADDRESS=127.0.0.1
POSTGRES_PORT=15432
REDIS_BIND_ADDRESS=127.0.0.1
REDIS_PORT=16379
SKILLHUB_PUBLIC_BASE_URL=http://127.0.0.1:18080
```

```sh
docker compose --env-file .env.release -f compose.release.yml -f compose.luma.yml build server web
docker compose --env-file .env.release -f compose.release.yml -f compose.luma.yml up -d --wait
```

入口为 [http://127.0.0.1:18080](http://127.0.0.1:18080)。升级时沿用原 Compose 项目名、配置和数据卷，同时更新 Server 和 Web。升级前按[备份与恢复](#备份与恢复)保存数据库、技能文件和配置，并记录当前镜像。应用镜像和数据库迁移分别验证后再决定回退方案。

## 发布技能

「发布技能」支持 ZIP、技能文件夹和公开外部链接。链接支持 GitHub、ClawHub、腾讯 SkillHub 和 Skills.sh。GitHub 优先使用目标文件夹或 `SKILL.md` 页面地址。包内长描述会预填为可编辑的页面简述，包内原文随技能包保留。已发布的外部版本可在详情中打开原始来源。

GitHub 仓库归档下载上限为 20 MiB，技能包还受解压大小及文件数量限制。归档过大时，可单独下载目标文件夹，保留根目录的 `SKILL.md`，再走「本地上传」。

## 备份与恢复

自带 PostgreSQL 和本地文件存储的部署需成套备份。启用 S3 时，将文件存储步骤换为相同时间窗口的桶快照或备份，并保留对象键和前缀。

1. 在维护窗口暂停发布、审核及其他写入，等待正在处理的任务进入终态。保存受限的 `.env.release` 和 Server、Web 镜像标识。
2. 从同一实例用 `pg_dump -Fc` 导出 PostgreSQL，再将 Server 的 `/var/lib/skillhub/storage` 数据卷归档，保留文件路径和权限。用 `docker inspect` 核对实际挂载和卷名，将数据库备份及文件归档保存到同一批次。
3. 用独立的 Compose 项目名、端口和新数据卷启动恢复实例。先启动 PostgreSQL，用 `pg_restore --exit-on-error --no-owner --no-privileges` 恢复到空库，再恢复技能文件至目标卷。先把该实例的邮件指向测试收件环境，再启动 Server 和 Web。
4. 登录恢复实例，核对版本清单、批准和审计记录，下载历史 ZIP 比对内容，并用有权账号和无权账号分别验证访问。会话和临时缓存由新实例重新建立，用户重新登录。

## CLI

页面提供可复制的 `skillhub` 命令。第一次使用时可安装兼容的上游包，也可以从本目录的 [cli 源码](cli/) 构建。需要私有空间访问时，在 Hub 创建对应权限的 API Token。

```sh
npm install --global @astron-team/skillhub
skillhub search calendar --registry http://127.0.0.1:18080
```

## 开发与检查

```sh
cd web
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

- [改版方案、验证计划与功能清单](docs/luma-enterprise-plan.md)
- [上游部署说明](docs/09-deployment.md)
- [上游源码与许可](UPSTREAM.md)
