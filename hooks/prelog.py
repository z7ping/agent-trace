#!/usr/bin/env python3
"""
PreToolUse hook: 记录工具调用开始时间和调用栈
与 log.py (PostToolUse) 配合计算耗时和父子调用关系

支持多项目：状态文件按项目分组存储在 ~/.claude/tooltrace/ 目录下
"""
import json
import sys
import os
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATES_DIR = os.path.join(BASE_DIR, "states")


def get_project_key(cwd=None):
    """根据当前工作目录生成项目标识"""
    if not cwd:
        cwd = os.getcwd()
    # 使用路径的 hash 作为项目标识，避免路径过长
    import hashlib
    return hashlib.md5(cwd.encode()).hexdigest()[:12]


def get_state_file(project_key):
    """获取项目对应的状态文件路径"""
    os.makedirs(STATES_DIR, exist_ok=True)
    return os.path.join(STATES_DIR, f"{project_key}.json")


def main():
    try:
        raw = sys.stdin.buffer.read().decode("utf-8")
        if not raw.strip():
            return
        data = json.loads(raw)
        if isinstance(data, list):
            for item in data:
                process(item)
        else:
            process(data)
    except Exception:
        # 静默失败，不影响 Claude Code 正常工作
        pass


def process(data):
    if not isinstance(data, dict):
        return

    tool_name = data.get("tool_name", "")
    if not tool_name:
        return

    # 从数据中获取 cwd（Claude Code 会传递）
    cwd = data.get("cwd") or data.get("working_directory") or os.getcwd()
    project_key = get_project_key(cwd)
    state_file = get_state_file(project_key)

    # 读取当前状态
    state = {"seq": 0, "stack": [], "cwd": cwd}
    if os.path.exists(state_file):
        try:
            with open(state_file, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    state = json.loads(content)
        except Exception:
            state = {"seq": 0, "stack": [], "cwd": cwd}

    state["seq"] += 1
    seq = state["seq"]

    # 记录父调用（栈顶元素的 seq）
    parent_seq = state["stack"][-1]["seq"] if state["stack"] else None

    entry = {
        "seq": seq,
        "tool_name": tool_name,
        "ts_start": datetime.now(timezone.utc).isoformat(),
        "parent_seq": parent_seq,
    }
    state["stack"].append(entry)

    with open(state_file, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=True)


if __name__ == "__main__":
    main()
