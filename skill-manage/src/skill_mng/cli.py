import argparse
import getpass
import json
import os
import socket
import sqlite3
import sys
from pathlib import Path

from . import __version__
from .auth import bootstrap_token, initialize
from .backup import backup, restore
from .config import data_path, read_config, write_config
from .db import migrate, transaction
from .lifecycle import process_record, run_server, start, stop


def parser() -> argparse.ArgumentParser:
    cli = argparse.ArgumentParser(prog="skill-mng", description="自托管 Skill 工作台")
    cli.add_argument("--version", action="version", version=__version__)
    cli.add_argument("--data-dir", help="数据目录（也可设置 SKILL_MNG_DATA）")
    commands = cli.add_subparsers(dest="command", required=True)
    setup = commands.add_parser("setup", help="创建管理员；重复执行不重置已有账号")
    setup.add_argument("--username")
    setup.add_argument("--password-file", type=Path, help="仅用于自动化；文件权限须为 600")
    setup.add_argument("--host", default="127.0.0.1")
    setup.add_argument("--port", type=int, default=8765)
    setup.add_argument("--model-base-url", help="可选兼容模型 API Base URL")
    setup.add_argument("--model-name", help="与 --model-base-url 一起使用")
    setup.add_argument("--model-key-file", type=Path, help="可选模型密钥文件，权限须为 600")
    setup.add_argument("--check-model", action="store_true", help="初始化后执行真实模型能力检测")
    for name in ("start", "stop", "status", "config", "doctor"):
        commands.add_parser(name)
    logs = commands.add_parser("logs")
    logs.add_argument("--lines", type=int, default=80)
    server = commands.add_parser("server").add_subparsers(dest="server_command", required=True)
    server.add_parser("start")
    run = server.add_parser("run", help="前台运行，供容器或服务管理器使用")
    run.add_argument("--instance", help=argparse.SUPPRESS)
    commands.add_parser("db").add_subparsers(dest="db_command", required=True).add_parser("migrate")
    commands.add_parser("backup").add_argument("output", type=Path)
    commands.add_parser("restore").add_argument("input", type=Path)
    worker = commands.add_parser("worker", help="独立 worker 接入与启停").add_subparsers(
        dest="action", required=True
    )
    join = worker.add_parser("join")
    join.add_argument("--server", required=True)
    join.add_argument("--name", default="本机 worker")
    join.add_argument("--code-stdin", action="store_true")
    join.add_argument("--replace", action="store_true")
    for action in ("start", "stop", "status", "logs"):
        worker.add_parser(action)
    worker.add_parser("run").add_argument("--instance", help=argparse.SUPPRESS)
    model = commands.add_parser("model", help="本地安全设置兼容模型服务").add_subparsers(
        dest="action", required=True
    )
    configure = model.add_parser("configure")
    configure.add_argument("--base-url", required=True)
    configure.add_argument("--model", required=True)
    configure.add_argument("--key-file", type=Path)
    configure.add_argument("--no-key", action="store_true")
    model.add_parser("status")
    model.add_parser("check")
    return cli


def execute(args) -> dict | None:
    root = data_path(args.data_dir)
    if args.command == "setup":
        if not 1 <= args.port <= 65535:
            raise ValueError("端口应在 1–65535 之间")
        socket.getaddrinfo(args.host, args.port, type=socket.SOCK_STREAM)
        migrate(root)

        def setup_model():
            from .models import save_model, probe_model, public_model_config

            if args.model_base_url or args.model_name or args.model_key_file:
                if not args.model_base_url or not args.model_name:
                    raise ValueError("模型配置需同时提供 --model-base-url 和 --model-name")
                if args.model_key_file:
                    if args.model_key_file.is_symlink() or args.model_key_file.stat().st_mode & 0o077:
                        raise ValueError("模型密钥文件权限须为 600，且不能是符号链接")
                    key = args.model_key_file.read_text().strip()
                else:
                    key = getpass.getpass("模型密钥（无鉴权服务可留空）：")
                save_model(root, args.model_base_url, args.model_name, key)
            return probe_model(root) if args.check_model else public_model_config(root)

        token = bootstrap_token(root)
        if token is None:
            return {"initialized": True, "reused": True, "data_dir": str(root), "model": setup_model()}
        username = args.username or input("管理员账号 [admin]：").strip() or "admin"
        if args.password_file:
            if args.password_file.is_symlink() or args.password_file.stat().st_mode & 0o077:
                raise ValueError("密码文件请使用普通文件，权限设置为 600")
            password = args.password_file.read_text().rstrip("\r\n")
        else:
            password = getpass.getpass("管理员密码（至少 12 字符）：")
            if password != getpass.getpass("再次输入密码："):
                raise ValueError("两次密码不一致")
        initialize(root, token, username, password)
        if not (root / "config.json").exists():
            write_config(root, {"host": args.host, "port": args.port})
        return {
            "initialized": True,
            "data_dir": str(root),
            "url": f"http://{args.host}:{args.port}",
            "model": setup_model(),
            "next": "在 Web 设置或 model configure 中填写模型，然后 model check",
        }
    if args.command == "restore":
        return restore(args.input, root)
    if args.command == "worker":
        from . import worker

        if args.action == "join":
            code = (
                sys.stdin.readline().strip() if args.code_stdin else getpass.getpass("一次性授权码：").strip()
            )
            return worker.join(root, args.server, code, args.name, args.replace)
        if args.action == "start":
            return worker.launch(root)
        if args.action == "stop":
            return stop(root, "worker")
        if args.action == "run":
            worker.run(root, args.instance)
            return None
        if args.action == "logs":
            path = root / "run/worker.log"
            print(path.read_text()[-12000:] if path.exists() else "尚无 worker 日志")
            return None
        record = process_record(root, "worker") if root.exists() else None
        state = root / "worker/state.json"
        return {
            "implemented": True,
            "running": bool(record),
            "pid": record["pid"] if record else None,
            "connection": json.loads(state.read_text()) if state.exists() else None,
        }
    if args.command == "model":
        from .models import probe_model, public_model_config, save_model

        if args.action == "status":
            return public_model_config(root)
        migrate(root)
        if args.action == "check":
            return probe_model(root)
        if args.key_file:
            if args.key_file.is_symlink() or args.key_file.stat().st_mode & 0o077:
                raise ValueError("密钥文件权限须为 600，且不能是符号链接")
            key = args.key_file.read_text().strip()
        else:
            key = "" if args.no_key else getpass.getpass("模型密钥（无鉴权服务可留空）：")
        return save_model(root, args.base_url, args.model, key)
    if args.command == "server" and args.server_command == "run":
        run_server(root, args.instance)
        return None
    if args.command in ("start", "server"):
        migrate(root)
        bootstrap_token(root)
        result = start(root)
        if args.command == "start":
            from .worker import launch

            result["worker"] = launch(root)
        return result
    if args.command == "stop":
        if root.exists():
            stop(root, "worker")
        return stop(root)
    if args.command == "status":
        record = process_record(root) if root.exists() else None
        return {
            "running": bool(record),
            "pid": record["pid"] if record else None,
            "data_dir": str(root),
            "worker": bool(process_record(root, "worker")) if root.exists() else False,
        }
    if args.command == "logs":
        path = root / "run/server.log"
        if path.exists():
            from collections import deque

            with path.open(errors="replace") as handle:
                print("".join(deque(handle, maxlen=max(1, min(args.lines, 1000)))), end="")
        else:
            print("尚无运行日志")
        return None
    if args.command == "config":
        config = read_config(root)
        from .models import public_model_config

        return {
            "data_dir": str(root),
            "host": config["host"],
            "port": config["port"],
            "model": public_model_config(root),
        }
    if args.command == "db":
        migrate(root)
        return {"migrated": True, "data_dir": str(root)}
    if args.command == "backup":
        return backup(root, args.output)
    if args.command == "doctor":
        checks = {
            "version": __version__,
            "data_dir": str(root),
            "exists": root.exists(),
            "writable": root.exists() and os.access(root, os.W_OK),
            "worker": bool(process_record(root, "worker")) if root.exists() else False,
        }
        if (root / "registry.db").exists():
            with transaction(root) as db:
                checks.update(
                    {
                        "sqlite": db.execute("PRAGMA quick_check").fetchone()[0],
                        "schema_version": db.execute("PRAGMA user_version").fetchone()[0],
                        "journal": db.execute("PRAGMA journal_mode").fetchone()[0],
                    }
                )
        checks["running"] = bool(process_record(root)) if root.exists() else False
        from .models import public_model_config

        checks["model"] = public_model_config(root)
        return checks
    raise ValueError("未知命令")


def main():
    args = parser().parse_args()
    try:
        result = execute(args)
        if result is not None:
            print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, RuntimeError, OSError, EOFError, sqlite3.Error) as exc:
        print(f"错误：{exc}", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
