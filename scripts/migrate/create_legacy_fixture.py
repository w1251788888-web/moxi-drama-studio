#!/usr/bin/env python3
"""S2.3 造旧系统 fixture：通过旧后端 HTTP API 建 1 项目 / 3 集 / 9 场 + 4 次内容保存。

背景：旧系统 SQLite 是运行期生成的，本机没有真实数据。S2.3 要求"同一份数据进出一致"，
因此用旧系统自己（真实路由代码）造一份可控 fixture，再走迁移 + 三重校验。

依赖：stdlib only（urllib）。旧后端需已启动（见 run_legacy_fixture.sh）。
鉴权：POST /api/admin/login（admin 密码来自 fixture-config.yaml，见 --password）。

用法：
    python3 create_legacy_fixture.py \
        --base-url http://127.0.0.1:6565 \
        --username admin --password MoxiFixture2026 \
        --manifest-out ../analysis/migrate/fixture/fixture-manifest.json

幂等：若同一 admin 名下已存在同名项目，脚本直接退出（exit 2），不重复造数据。
所有内容文本为硬编码中文，保证每次 fixture 内容逐字节一致（时间戳除外）。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

PROJECT_NAME = "雾港旧书店"
PROJECT_DESCRIPTION = "母亲留下的旧书店，藏着父亲失踪的线索。"

EPISODES = [
    {
        "title": "遗嘱与钥匙",
        "summary": "母亲葬礼后，沈知意收到一把没有地址的钥匙，遗嘱要求她独自守店七天。",
    },
    {
        "title": "夜半访客",
        "summary": "守店第二夜，陌生男人自称是父亲旧友，留下一本被撕掉一页的账本。",
    },
    {
        "title": "阁楼来信",
        "summary": "沈知意在阁楼夹层找到母亲未寄出的信，信里点名书店真正的继承人。",
    },
]

# (episode_number, scene_number, time, location_type, location_name, content)
SCENES = [
    (
        1, 1, "日", "内", "书店大堂",
        "沈知意推开积灰的玻璃门，风铃哑了半声。柜台后那把藤椅空着，扶手上还搭着母亲织到一半的毛线。她把行李箱靠在门边，抬头看见吊灯下悬着一把黄铜钥匙，钥匙上贴着一枚褪色的船票。",
    ),
    (
        1, 2, "夜", "内", "书店后间",
        "后间只有一盏台灯。沈知意撬开母亲锁了十年的铁皮盒，里面没有存折，只有一张手绘地图和半张全家福。照片上父亲的脸被人用钢笔涂黑，背面写着一行小字：第七天，别开门。",
    ),
    (
        1, 3, "晨", "外", "街口",
        "王姨拎着豆浆站在卷帘门外，话里有话地打听书店什么时候转让。沈知意笑着摇头，王姨转身时嘀咕了一句：这店晦气，你妈当年也不该留着。沈知意攥紧了口袋里的钥匙。",
    ),
    (
        2, 1, "夜", "内", "书店大堂",
        "雨点砸在遮阳棚上。敲门声不急不缓，敲了三下。门外站着一个穿旧风衣的男人，手里提着一本用麻绳捆住的账本。他说自己姓周，是沈知意父亲三十年前的合伙人。",
    ),
    (
        2, 2, "夜", "内", "书店大堂",
        "账本摊在柜台上，最后一页被整齐撕掉。周先生指着缺口说，那一页记着一笔船运，货是书，收货人却是早已注销的航运公司。沈知意问父亲去哪了，他沉默半晌，只说：船沉那天，你爸在岸上。",
    ),
    (
        2, 3, "夜", "内", "书店后巷",
        "沈知意送客时发现后巷停着一辆没有牌照的面包车。车灯亮了一下又熄灭，雨里有人举着手机对准书店的侧窗。她退回门内反锁，第一次觉得母亲留下的遗嘱像一道锁，锁住的不是店，是人。",
    ),
    (
        2, 4, "夜", "内", "阁楼",
        "阁楼堆满旧书，霉味呛人。沈知意循着地图上的红叉找到书架背面，敲了三下，一块木板是空的。夹层里躺着一只铁盒，盒盖上贴着与钥匙相同的船票编号。",
    ),
    (
        3, 1, "日", "内", "阁楼",
        "信纸共有三页。母亲写道：书店真正的继承人不姓沈，姓周。当年那笔船运没有沉，是有人把它藏进了书里。信的末尾让沈知意不要相信任何人，包括来送信的人。楼下门铃在这时响了。",
    ),
    (
        3, 2, "昏", "外", "码头",
        "夕阳把码头染成锈色。沈知意按信里的地址等到天黑，来人摘下帽子，露出一张和旧照片上父亲一模一样的脸。他开口第一句话是：钥匙带了吗？海风掀起她手里的信纸，露出第三页背面的一行血字。",
    ),
]

# 保存动作：content_version 的来源。create_checkpoint 只在第一次保存时开启（生成 1 个 checkpoint）。
SAVES = [
    {
        "episode_number": 1, "scene_number": 1, "version_label": "v1-初稿",
        "editor_type": "human", "editor_id": "fixture-writer", "editor_name": "夹具写手",
        "change_note": "夹具：1-1 初稿",
        "create_checkpoint": True,
        "content": "沈知意推开玻璃门，风铃哑了半声。柜台后的藤椅空着，扶手上还搭着母亲织到一半的毛线。她把行李箱靠在门边，抬头看见吊灯下悬着一把黄铜钥匙，钥匙上贴着一枚褪色的船票。",
    },
    {
        "episode_number": 1, "scene_number": 1, "version_label": "v2-改稿",
        "editor_type": "ai", "editor_id": "fixture-agent", "editor_name": "夹具写手AI",
        "change_note": "夹具：1-1 AI 扩写",
        "create_checkpoint": False,
        "content": "沈知意推开积灰的玻璃门，风铃哑了半声。柜台后那把藤椅空着，扶手上还搭着母亲织到一半的毛线。她把行李箱靠在门边，抬头看见吊灯下悬着一把黄铜钥匙，钥匙上贴着一枚褪色的船票。",
    },
    {
        "episode_number": 2, "scene_number": 1, "version_label": "v1-初稿",
        "editor_type": "human", "editor_id": "fixture-writer", "editor_name": "夹具写手",
        "change_note": "夹具：2-1 初稿",
        "create_checkpoint": False,
        "content": "雨点砸在遮阳棚上。敲门声不急不缓，敲了三下。门外站着一个穿旧风衣的男人，手里提着一本用麻绳捆住的账本。他说自己姓周，是沈知意父亲三十年前的合伙人。",
    },
    {
        "episode_number": 3, "scene_number": 2, "version_label": "v1-初稿",
        "editor_type": "human", "editor_id": "fixture-writer", "editor_name": "夹具写手",
        "change_note": "夹具：3-2 初稿",
        "create_checkpoint": False,
        "content": "夕阳把码头染成锈色。沈知意按信里的地址等到天黑，来人摘下帽子，露出一张和旧照片上父亲一模一样的脸。他开口第一句话是：钥匙带了吗？海风掀起她手里的信纸，露出第三页背面的一行血字。",
    },
]


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class Api:
    def __init__(self, base_url: str, token: str = ""):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.log: list[dict] = []

    def call(self, method: str, path: str, body: dict | None = None) -> object:
        url = self.base_url + path
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if self.token:
            headers["X-Admin-Token"] = self.token
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                status = resp.status
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            raise SystemExit(f"[fixture] HTTP {exc.code} {method} {path}: {raw}") from exc
        payload = json.loads(raw) if raw else None
        self.log.append({"method": method, "path": path, "status": status,
                         "response": payload})
        return payload

    def login(self, username: str, password: str) -> None:
        payload = self.call("POST", "/api/admin/login",
                            {"username": username, "password": password})
        self.token = payload["token"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:6565")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", default="MoxiFixture2026")
    parser.add_argument("--project-name", default=PROJECT_NAME,
                        help="fixture 项目名（决定旧工作区目录名；默认 雾港旧书店）")
    parser.add_argument("--manifest-out", required=True)
    args = parser.parse_args()

    api = Api(args.base_url)
    api.login(args.username, args.password)

    project_name = str(args.project_name or PROJECT_NAME).strip()
    projects = api.call("GET", "/api/v2/projects/?limit=200&offset=0")
    for p in projects or []:
        if p.get("name") == project_name:
            print(f"[fixture] 已存在同名 fixture 项目 ({p['id']})，为防重复造数据直接退出。",
                  file=sys.stderr)
            return 2

    project = api.call("POST", "/api/v2/projects/", {
        "name": project_name,
        "description": PROJECT_DESCRIPTION,
        "project_type": "真人短剧-女频",
        "audience_axis": "女频",
        "genre_main": "家庭",
        "genre_sub": "悬疑",
        "creation_mode": "solo",
        "config": {
            "total_episodes": 3,
            "confirmed_total_episodes": 3,
            "episode_count_status": "confirmed",
            "word_count_per_episode": "1000-1550",
            "scene_header_style": "bracket",
            "episode_seconds": 90,
        },
    })
    project_id = project["id"]

    episodes: list[dict] = []
    for ep in EPISODES:
        resp = api.call("POST", f"/api/v2/projects/{project_id}/episodes", ep)
        episodes.append({"episode_number": resp["episode_number"], "id": resp["id"],
                         "title": resp["title"]})

    scenes: list[dict] = []
    for ep_no, sc_no, t, loc_type, loc_name, content in SCENES:
        resp = api.call(
            "POST",
            f"/api/v2/projects/{project_id}/episodes/{ep_no}/scenes",
            {"time": t, "location_type": loc_type,
             "location_name": loc_name, "content": content},
        )
        scenes.append({"episode_number": ep_no, "scene_number": sc_no,
                       "id": resp["id"], "scene_code": resp["scene_code"],
                       "content_sha256": _sha256(resp["content"])})
        # 建场景时先写入最终正文，保证未保存的场次也有内容可迁移；
        # 下面 SAVES 里再次保存会覆盖并生成 content_version（版本历史）。
        assert resp["content"] == content, "创建场景回显内容与请求不一致"

    saves: list[dict] = []
    for save in SAVES:
        body = {
            "content": save["content"],
            "editor_type": save["editor_type"],
            "editor_id": save["editor_id"],
            "editor_name": save["editor_name"],
            "change_note": save["change_note"],
            "create_checkpoint": save["create_checkpoint"],
        }
        resp = api.call(
            "POST",
            f"/api/v2/projects/{project_id}/episodes/{save['episode_number']}"
            f"/scenes/{save['scene_number']}/save",
            body,
        )
        saves.append({
            "episode_number": save["episode_number"],
            "scene_number": save["scene_number"],
            "version_label": save["version_label"],
            "version_id": resp["id"],
            "version_code": resp["version_code"],
            "content_sha256": _sha256(save["content"]),
            "content_length": len(save["content"]),
        })

    project_detail = api.call("GET", f"/api/v2/projects/{project_id}")
    manifest = {
        "fixtureVersion": 1,
        "baseUrl": args.base_url,
        "projectName": project_name,
        "projectId": project_id,
        "projectWorkspacePath": project_detail["workspace_path"],
        "projectConfig": project_detail["config"],
        "episodes": episodes,
        "scenes": scenes,
        "saves": saves,
        "apiCallCount": len(api.log),
        "apiLog": api.log,
    }
    out = Path(args.manifest_out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[fixture] OK project={project_id} episodes={len(episodes)} "
          f"scenes={len(scenes)} saves={len(saves)} api_calls={len(api.log)}")
    print(f"[fixture] workspace={manifest['projectWorkspacePath']}")
    print(f"[fixture] manifest={out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
