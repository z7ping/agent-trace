#!/usr/bin/env python3
"""
PostToolUse hook: 记录工具调用日志（含耗时、调用链）
由 prelog.py (PreToolUse) + log.py (PostToolUse) 配合实现耗时追踪

支持多项目：日志按项目分组存储在 ~/.claude/tooltrace/ 目录下
"""
import json
import sys
import os
import hashlib
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGS_DIR = os.path.join(BASE_DIR, "logs")
STATES_DIR = os.path.join(BASE_DIR, "states")
PROJECTS_FILE = os.path.join(BASE_DIR, "projects.json")


def get_project_key(cwd=None):
    """根据当前工作目录生成项目标识"""
    if not cwd:
        cwd = os.getcwd()
    return hashlib.md5(cwd.encode()).hexdigest()[:12]


def get_project_name(cwd=None):
    """获取项目名称（用于显示）"""
    if not cwd:
        cwd = os.getcwd()
    return os.path.basename(cwd)


def get_log_file(project_key):
    """获取项目对应的日志文件路径"""
    os.makedirs(LOGS_DIR, exist_ok=True)
    return os.path.join(LOGS_DIR, f"{project_key}.jsonl")


def get_state_file(project_key):
    """获取项目对应的状态文件路径"""
    os.makedirs(STATES_DIR, exist_ok=True)
    return os.path.join(STATES_DIR, f"{project_key}.json")


def update_projects_file(project_key, cwd, project_name):
    """更新项目列表文件"""
    projects = {}
    if os.path.exists(PROJECTS_FILE):
        try:
            with open(PROJECTS_FILE, "r", encoding="utf-8") as f:
                projects = json.load(f)
        except Exception:
            projects = {}

    projects[project_key] = {
        "cwd": cwd,
        "name": project_name,
        "last_seen": datetime.now(timezone.utc).isoformat()
    }

    with open(PROJECTS_FILE, "w", encoding="utf-8") as f:
        json.dump(projects, f, ensure_ascii=True, indent=2)


def read_state(project_key):
    """读取调用栈状态"""
    state_file = get_state_file(project_key)
    if os.path.exists(state_file):
        try:
            with open(state_file, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return json.loads(content)
        except Exception:
            pass
    return {"seq": 0, "stack": []}


def write_state(state, project_key):
    """写回调用栈状态"""
    state_file = get_state_file(project_key)
    with open(state_file, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=True)


def truncate(obj, max_len=200):
    """截断过长的字符串，保持日志文件小巧"""
    if isinstance(obj, str):
        return obj[:max_len] + ("…" if len(obj) > max_len else "")
    if isinstance(obj, dict):
        return {k: truncate(v, max_len) for k, v in obj.items()}
    if isinstance(obj, list):
        return [truncate(i, max_len) for i in obj[:10]] + (
            ["…"] if len(obj) > 10 else []
        )
    return obj


def summarize_input(tool_name, tool_input):
    """对工具输入做摘要，只保留关键信息"""
    summary = {}
    if tool_name == "Bash":
        cmd = str(tool_input.get("command", ""))
        summary["command"] = cmd[:120] + ("…" if len(cmd) > 120 else "")
        summary["description"] = tool_input.get("description", "")
    elif tool_name in ("Read", "Write", "Edit", "Glob", "Grep"):
        summary["file_path"] = tool_input.get("file_path", "")
        if tool_name == "Edit":
            summary["old_len"] = len(tool_input.get("old_string", ""))
            summary["new_len"] = len(tool_input.get("new_string", ""))
        elif tool_name == "Grep":
            summary["pattern"] = tool_input.get("pattern", "")
            summary["output_mode"] = tool_input.get("output_mode", "")
        elif tool_name == "Glob":
            summary["pattern"] = tool_input.get("pattern", "")
    elif tool_name.startswith("mcp__"):
        parts = tool_name.split("__")
        summary["mcp_server"] = parts[1] if len(parts) > 2 else ""
        mcp_tool = parts[-1] if len(parts) > 2 else tool_name
        summary["tool"] = mcp_tool
        for key in ("query", "symbol", "pattern", "prompt", "path", "question"):
            if key in tool_input:
                val = str(tool_input[key])
                summary[key] = val[:100] + ("…" if len(val) > 100 else "")
    else:
        summary["keys"] = list(tool_input.keys())[:8]
    return summary


def extract_error(response):
    """从 tool_response 中提取错误信息"""
    if isinstance(response, str):
        return response[:300] if response.strip() else None
    if isinstance(response, dict):
        for key in ("error", "message", "stderr", "errorMessage", "error_message"):
            val = response.get(key)
            if val:
                val = str(val)
                if val and val not in ("None", "false", "True"):
                    return val[:300]
        return None
    if isinstance(response, list):
        for item in response:
            if isinstance(item, dict):
                err = extract_error(item)
                if err:
                    return err
    return None


def clean_str(obj):
    """递归清理字符串，移除 surrogate 字符"""
    if isinstance(obj, str):
        return obj.encode("utf-8", "surrogatepass").decode("utf-8", "replace")
    if isinstance(obj, dict):
        return {k: clean_str(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_str(i) for i in obj]
    return obj


def pop_from_stack(state, tool_name):
    """
    从调用栈中找到匹配的 entry 并弹出。
    从栈顶向下搜索，找到第一个 tool_name 匹配的条目。
    如果找不到（栈为空或名称不匹配），返回 None。
    """
    for i in range(len(state["stack"]) - 1, -1, -1):
        if state["stack"][i]["tool_name"] == tool_name:
            entry = state["stack"].pop(i)
            return entry
    return None


def main():
    try:
        raw = sys.stdin.buffer.read().decode("utf-8")
        if not raw.strip():
            return
        data = json.loads(raw)
        if isinstance(data, list):
            for item in data:
                process_record(item)
        else:
            process_record(data)
    except Exception as e:
        try:
            fallback = os.path.join(BASE_DIR, "trace_error.log")
            import traceback

            with open(fallback, "a", encoding="utf-8") as f:
                f.write(f"[{datetime.now()}] {type(e).__name__}: {e}\n")
                traceback.print_exc(file=f)
        except:
            pass


def process_record(data, depth=0):
    if isinstance(data, list):
        for i, item in enumerate(data):
            process_record(item, depth + 1)
        return

    if not isinstance(data, dict):
        return

    # 从数据中获取 cwd
    cwd = data.get("cwd") or data.get("working_directory") or os.getcwd()
    project_key = get_project_key(cwd)
    project_name = get_project_name(cwd)

    # 更新项目列表
    update_projects_file(project_key, cwd, project_name)

    response = data.get("tool_response", {})
    if isinstance(response, list):
        response = response[0] if response else {}

    # === 判断成功/失败 ===
    tool_name = data.get("tool_name", "")
    success = True
    error_msg = None

    if isinstance(response, dict):
        # 结构化工具（Read/Write/Edit/MCP 等）
        success = response.get("success", True)
        exit_code = response.get("exit_code")
        if exit_code is not None and exit_code != 0:
            success = False
        if not success:
            error_msg = (
                response.get("stderr")
                or response.get("error")
                or extract_error(response)
            )
            if exit_code is not None and exit_code != 0:
                error_msg = f"Exit code {exit_code}" + (f": {error_msg}" if error_msg else "")

    elif isinstance(response, str):
        # Bash 工具：tool_response 只包含 stdout，不包含 stderr
        # 所以纯 stderr 错误无法从 hook 数据中检测
        resp_text = response.strip()
        if resp_text:
            error_patterns = [
                "Traceback (most recent call last)",
                "Error:", "ERROR:", "FATAL:",
                "SyntaxError:", "FileNotFoundError:", "Permission denied",
                "No such file or directory", "command not found", "fatal:",
            ]
            if any(p in resp_text for p in error_patterns):
                success = False
                error_msg = resp_text[:300]

    # === 读取调用栈，计算耗时和调用链 ===
    # 优先用 Claude Code 提供的 duration_ms，否则用 prelog 算的
    cc_duration_ms = data.get("duration_ms")
    parent_seq = None
    call_seq = None

    if tool_name:
        state = read_state(project_key)
        pre_entry = pop_from_stack(state, tool_name)
        if pre_entry:
            call_seq = pre_entry.get("seq")
            parent_seq = pre_entry.get("parent_seq")
            if cc_duration_ms is None:
                try:
                    ts_start = datetime.fromisoformat(pre_entry["ts_start"])
                    ts_now = datetime.now(timezone.utc)
                    cc_duration_ms = round(
                        (ts_now - ts_start).total_seconds() * 1000, 1
                    )
                except Exception:
                    pass
        write_state(state, project_key)

    # === 组装记录 ===
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "session_id": data.get("session_id", ""),
        "project_key": project_key,
        "project_name": project_name,
        "tool_name": tool_name,
        "input_summary": summarize_input(tool_name, data.get("tool_input", {})),
        "success": success,
    }

    # 加入调用链元数据
    if call_seq is not None:
        record["seq"] = call_seq
    if parent_seq is not None:
        record["parent_seq"] = parent_seq
    if cc_duration_ms is not None:
        record["duration_ms"] = cc_duration_ms

    # 写入错误信息（已在上文提取到 error_msg）
    if not success and error_msg:
        record["error"] = error_msg.strip()[:500]
    record = clean_str(record)

    # 写入项目对应的日志文件
    log_file = get_log_file(project_key)
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=True) + "\n")


if __name__ == "__main__":
    main()
