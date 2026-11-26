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

入口为 [http://127.0.0.1:18080](http://127.0.0.1:18080)。升级正在运行的 v0.2.28 实例时沿用原 Compose 项目名和配置。本版的账号内置头像需要同时更新 Server 和 Web。数据库、数据卷及已留存的 Skill 包沿用原实例。回退时只用原 `compose.release.yml` 更新 Server 和 Web。

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
