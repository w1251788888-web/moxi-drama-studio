#!/usr/bin/env python3
"""moxi QA · 极简 API 客户端（读 /tmp/moxi-cookies.txt 的 token cookie）"""
import json
import os
import re
import glob
import urllib.request

BASE = os.environ.get('MOXI_API', 'http://127.0.0.1:59911/api/moxi')
COOKIE_FILE = os.environ.get('MOXI_COOKIE', '/tmp/moxi-cookies.txt')
URL_FILE = os.environ.get('MOXI_URL', '/tmp/moxi-url.txt')


def _cookie_header():
    pairs = []
    if os.path.exists(COOKIE_FILE):
        for line in open(COOKIE_FILE, encoding='utf-8'):
            raw = line.strip()
            if not raw:
                continue
            if raw.startswith('#HttpOnly_'):
                raw = raw[len('#HttpOnly_'):]
            elif raw.startswith('#'):
                continue
            parts = raw.split('\t')
            if len(parts) >= 7:
                pairs.append(f'{parts[5]}={parts[6]}')
    return '; '.join(pairs)


def post(path, payload=None):
    data = json.dumps(payload or {}).encode()
    req = urllib.request.Request(BASE + path, data=data, method='POST')
    req.add_header('content-type', 'application/json')
    cookie = _cookie_header()
    if cookie:
        req.add_header('cookie', cookie)
    with urllib.request.urlopen(req, timeout=600) as resp:
        body = json.loads(resp.read().decode())
    if not body.get('ok'):
        err = body.get('error') or {}
        raise RuntimeError(f"{path} 失败: {err.get('code')} {err.get('message')}")
    return body['value']


def token_url():
    if os.path.exists(URL_FILE):
        return open(URL_FILE, encoding='utf-8').read().strip()
    return None


def find_project(title_part):
    for p in post('/projects/list'):
        if title_part in p['title']:
            return p
    return None


if __name__ == '__main__':
    print(json.dumps(post('/hello'), ensure_ascii=False, indent=1))
