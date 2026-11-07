#!/usr/bin/env python3
"""rules_lint.py — 规则包 v2 确定性校验（纯标准库，可离线跑）。

五项检查：
  ① manifest-sync    manifest.json 与磁盘文件一致（数量 / 路径 / sha256 / 统计口径）
  ② h1-titles        每个 .md 有可解析标题；文档类必须有字面 H1
  ③ pipeline-refs    pipeline.json 结构合法，引用的 ruleFile / agentFile 均存在
  ④ cross-references 包内交叉引用（路径引用 / markdown 链接 / {{rules:...}}）是否命中
  ⑤ duplicate-names  可寻址命名空间内的重复文件名冲突

用法：
  python3 moxi/scripts/rules_lint.py [--pack DIR] [--json] [--json-out FILE] [--strict] [-q]
退出码：0 = 无 error；1 = 有 error（--strict 时 warning 也算 error）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import posixpath
import re
import sys
from collections import Counter, OrderedDict

NODE_TYPES = {
    'project_root', 'settings', 'asset', 'beat_sheet', 'scene_list',
    'script_scene', 'quality', 'compliance', 'delivery',
}
H1_REQUIRED_KINDS = {'document', 'knowledge', 'rag-card', 'template'}
# ④ 的扫描范围：规则/步骤/Agent/知识/模板/旧配置；不含 v2 说明文档与 legacy 文档
REF_SCAN_KINDS = {
    'core-rule', 'rule', 'step', 'agent', 'knowledge', 'rag-card',
    'template', 'pipeline-config', 'pipeline', 'prompt-fragment',
}
DIR_REF_RE = re.compile(
    r'(?<![\w./-])((?:core|core-rules|steps|agents|knowledge|templates)/[A-Za-z0-9_.\-/]+\.md)'
)
LINK_RE = re.compile(r'\]\(([^)\s]+)\)')
PLACEHOLDER_RE = re.compile(r'\{\{rules:(\w+)\}\}')
BARE_MD_RE = re.compile(r'(?<![A-Za-z0-9_./-])([A-Za-z0-9_\-]+\.md)(?![A-Za-z0-9_])')


# ── 通用 ──────────────────────────────────────────────────────────────────
def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as fp:
        for chunk in iter(lambda: fp.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def kind_of(path: str) -> str:
    if path == 'README.md':
        return 'document'
    if path == 'manifest.json':
        return 'manifest'
    if path == 'pipeline.json':
        return 'pipeline'
    if path == 'pipeline.toml':
        return 'pipeline-config'
    if path in ('system.md', 'rhythm.md', 'hooks.md'):
        return 'prompt-fragment'
    if path == 'source-README.md':
        return 'document'
    for pre, kind in (
        ('core/', 'core-rule'), ('core-rules/', 'rule'), ('steps/', 'step'),
        ('agents/', 'agent'), ('knowledge/rag_cards/', 'rag-card'),
        ('knowledge/', 'knowledge'), ('templates/', 'template'),
    ):
        if path.startswith(pre):
            return kind
    return 'document'


def extract_title(text: str) -> tuple[str, str]:
    for line in text.splitlines():
        if line.startswith('# '):
            return line[2:].strip(), 'h1'
    if text.startswith('---'):
        m = re.match(r'^---\s*\n(.*?)\n---\s*\n', text, re.S)
        if m:
            for key in ('name', 'title', 'description', 'role'):
                mm = re.search(rf'^{key}\s*[:：]\s*(.+)$', m.group(1), re.M)
                if mm:
                    return mm.group(1).strip().strip('"\''), 'frontmatter'
    for line in text.splitlines():
        if line.startswith('## '):
            return line[3:].strip(), 'h2'
    for line in text.splitlines():
        if line.strip():
            return line.strip()[:120], 'firstline'
    return '', 'none'


def result(check_id: str, title: str, description: str):
    return OrderedDict([
        ('id', check_id), ('title', title), ('description', description),
        ('passed', True), ('errors', []), ('warnings', []), ('stats', {}),
    ])


def err(r, msg: str):
    r['passed'] = False
    r['errors'].append(msg)


def warn(r, msg: str):
    r['warnings'].append(msg)


# ── ① manifest-sync ───────────────────────────────────────────────────────
def check_manifest_sync(pack: pathlib.Path):
    r = result('manifest-sync', 'manifest 与磁盘一致',
               'manifest.json 的 counts / files 路径 / sha256 与磁盘逐项相等')
    mpath = pack / 'manifest.json'
    if not mpath.is_file():
        err(r, 'manifest.json 不存在')
        return r
    try:
        manifest = json.loads(mpath.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        err(r, f'manifest.json 不是合法 JSON: {exc}')
        return r
    if manifest.get('version') != 2:
        err(r, f'manifest.version != 2（实际 {manifest.get("version")!r}）')
    entries = manifest.get('files')
    if not isinstance(entries, list) or not entries:
        err(r, 'manifest.files 缺失或为空')
        return r

    listed = {}
    dup = []
    for e in entries:
        p = e.get('path')
        if not p:
            err(r, 'manifest.files 存在缺少 path 的条目')
            continue
        if p in listed:
            dup.append(p)
        listed[p] = e
    if dup:
        err(r, f'manifest.files 路径重复: {sorted(set(dup))}')

    disk = sorted(str(p.relative_to(pack)) for p in pack.rglob('*') if p.is_file())
    disk_set = set(disk)
    expect = disk_set - {'manifest.json'}
    missing = sorted(expect - set(listed))
    extra = sorted(set(listed) - expect)
    if missing:
        err(r, f'磁盘文件未收录进 manifest.files（{len(missing)}）: {missing[:20]}')
    if extra:
        err(r, f'manifest.files 指向不存在的文件（{len(extra)}）: {extra[:20]}')

    bad_sha, bad_kind = [], []
    by_kind = Counter()
    sum_words = 0
    sum_bytes = 0
    for p in sorted(expect):
        e = listed.get(p)
        if not e:
            continue
        fp = pack / p
        real = sha256_file(fp)
        if e.get('sha256') != real:
            bad_sha.append(p)
        k = e.get('kind')
        if k != kind_of(p):
            bad_kind.append(f'{p} (manifest={k!r}, 盘上应为 {kind_of(p)!r})')
        by_kind[kind_of(p)] += 1
        sum_words += int(e.get('words') or 0)
        sum_bytes += int(e.get('bytes') or 0)
    if bad_sha:
        err(r, f'sha256 不匹配（{len(bad_sha)}）: {bad_sha[:20]}')
    if bad_kind:
        err(r, f'kind 与路径不符（{len(bad_kind)}）: {bad_kind[:20]}')

    counts = manifest.get('counts') or {}
    if counts.get('packFiles') != len(expect):
        err(r, f'counts.packFiles={counts.get("packFiles")!r}，磁盘实测（不含 manifest.json）={len(expect)}')
    if counts.get('migratedFiles') != len([e for e in entries if e.get('sourcePath')]):
        err(r, 'counts.migratedFiles 与 files[*].sourcePath 数量不符')
    if counts.get('textCharsNoWhitespace') != sum_words:
        err(r, f'counts.textCharsNoWhitespace={counts.get("textCharsNoWhitespace")!r}，files[*].words 求和={sum_words}')
    if counts.get('packBytes') != sum_bytes:
        err(r, f'counts.packBytes={counts.get("packBytes")!r}，files[*].bytes 求和={sum_bytes}')
    if dict(sorted((counts.get('byKind') or {}).items())) != dict(sorted(by_kind.items())):
        err(r, 'counts.byKind 与 files[*].kind 统计不符')
    pr = manifest.get('pathRewrites') or []
    prs = manifest.get('pathRewriteSummary') or {}
    if prs.get('total') != len(pr):
        err(r, 'pathRewriteSummary.total 与 pathRewrites 条数不符')
    if prs.get('filesChanged') != len({x.get('file') for x in pr}):
        err(r, 'pathRewriteSummary.filesChanged 与 pathRewrites 去重文件数不符')
    skipped = manifest.get('skippedFiles') or []
    r['stats'] = {
        'diskFilesExcludingManifest': len(expect),
        'manifestEntries': len(entries),
        'missingInManifest': len(missing),
        'staleInManifest': len(extra),
        'sha256Mismatch': len(bad_sha),
        'kindMismatch': len(bad_kind),
        'bytes': sum_bytes,
        'words': sum_words,
        'pathRewrites': len(pr),
        'pathRewriteFiles': len({x.get('file') for x in pr}),
        'skippedFiles': [s.get('path') for s in skipped],
    }
    return r


# ── ② h1-titles ───────────────────────────────────────────────────────────
def check_titles(pack: pathlib.Path):
    r = result('h1-titles', '每个 md 有可解析标题（文档类必须有字面 H1）',
               'prompt 片段（step/agent/rule/prompt-fragment）允许 frontmatter/## 式标题；'
               'document/knowledge/rag-card/template 必须字面 H1')
    md_files = sorted(pack.rglob('*.md'))
    dist = Counter()
    missing_literal = []
    unresolvable = []
    for p in md_files:
        rel = str(p.relative_to(pack))
        try:
            text = p.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            err(r, f'{rel} 不是 UTF-8 文本')
            continue
        title, src = extract_title(text)
        kind = kind_of(rel)
        dist[f'{kind}:{src}'] += 1
        if src != 'h1':
            missing_literal.append({'path': rel, 'kind': kind, 'titleSource': src})
            if kind in H1_REQUIRED_KINDS:
                err(r, f'{rel}（kind={kind}）缺少字面 H1 标题（实际标题来源 {src}）')
        if not title:
            unresolvable.append(rel)
    if unresolvable:
        err(r, f'{len(unresolvable)} 个 md 解析不出任何标题: {unresolvable[:20]}')
    r['stats'] = {
        'mdFiles': len(md_files),
        'literalH1': len(md_files) - len(missing_literal),
        'nonLiteralH1': len(missing_literal),
        'nonLiteralH1ByKind': dict(sorted(Counter(x['kind'] for x in missing_literal).items())),
        'titleSourceDistribution': dict(sorted(dist.items())),
        'h1RequiredKinds': sorted(H1_REQUIRED_KINDS),
        'exemptedKinds': sorted({x['kind'] for x in missing_literal} - H1_REQUIRED_KINDS),
    }
    exempt = [x for x in missing_literal if x['kind'] not in H1_REQUIRED_KINDS]
    if exempt:
        by_kind_tmp = Counter()
        for x in exempt:
            by_kind_tmp[x['kind']] += 1
        warn(r, f'{len(exempt)} 个 prompt 类 md 无字面 H1（按 frontmatter/##/首行取标题，规则内容不可改写，'
                f'属源包固有约定）: {dict(sorted(by_kind_tmp.items()))}；明细见 stats.nonLiteralH1List')
    r['stats']['nonLiteralH1List'] = [{'path': x['path'], 'kind': x['kind'], 'titleSource': x['titleSource']} for x in exempt]
    return r


# ── ③ pipeline-refs ───────────────────────────────────────────────────────
def check_pipeline(pack: pathlib.Path):
    r = result('pipeline-refs', 'pipeline.json 结构与引用',
               'version/steps/nodeType/dependsOn/ruleFile + gates/rules/configDigest 引用均合法且文件存在')
    ppath = pack / 'pipeline.json'
    if not ppath.is_file():
        err(r, 'pipeline.json 不存在')
        return r
    try:
        p = json.loads(ppath.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        err(r, f'pipeline.json 不是合法 JSON: {exc}')
        return r
    if p.get('version') != 2:
        err(r, f'pipeline.version != 2（实际 {p.get("version")!r}）')
    if sorted(p.get('nodeTypes') or []) != sorted(NODE_TYPES):
        err(r, 'pipeline.nodeTypes 与 9 类节点集合不一致')

    steps = p.get('steps') or []
    aux = p.get('auxStepTemplates') or []
    if not steps:
        err(r, 'pipeline.steps 为空')
    ids = set()
    step_by_id = {}
    for s in steps:
        sid = s.get('id')
        if not sid:
            err(r, 'steps 存在缺少 id 的条目')
            continue
        if sid in ids:
            err(r, f'step id 重复: {sid}')
        ids.add(sid)
        step_by_id[sid] = s
        nt = s.get('nodeType')
        if nt is not None and nt not in NODE_TYPES:
            err(r, f'{sid}.nodeType={nt!r} 不在 9 类节点内')
        rf = s.get('ruleFile')
        if not rf:
            err(r, f'{sid} 缺少 ruleFile')
        elif not (pack / rf).is_file():
            err(r, f'{sid}.ruleFile 不存在: {rf}')
        af = s.get('agentFile')
        if af and not (pack / af).is_file():
            err(r, f'{sid}.agentFile 不存在: {af}')
        for dep in s.get('dependsOn') or []:
            if dep not in ids:
                err(r, f'{sid}.dependsOn 指向未知 step: {dep}')
        for dep in s.get('contextDependsOn') or []:
            if dep not in {x.get('id') for x in steps + aux}:
                err(r, f'{sid}.contextDependsOn 指向未知 step: {dep}')
    aux_ids = set()
    for s in aux:
        sid = s.get('id')
        if not sid:
            err(r, 'auxStepTemplates 存在缺少 id 的条目')
            continue
        if sid in ids or sid in aux_ids:
            err(r, f'aux step id 冲突: {sid}')
        aux_ids.add(sid)
        nt = s.get('nodeType')
        if nt is not None and nt not in NODE_TYPES:
            err(r, f'aux {sid}.nodeType={nt!r} 不在 9 类节点内')
        rf = s.get('ruleFile')
        if not rf or not (pack / rf).is_file():
            err(r, f'aux {sid}.ruleFile 不存在: {rf!r}')

    order = p.get('stepOrder') or {}
    for name, seq in order.items():
        for sid in seq:
            if sid not in ids:
                err(r, f'stepOrder.{name} 含未知 step: {sid}')
    required = p.get('requiredStages') or []
    for st in required:
        sid = st.get('stepId')
        if sid not in ids:
            err(r, f'requiredStages 引用未知 step: {sid}')
        elif step_by_id.get(sid, {}).get('nodeType') != st.get('nodeType'):
            err(r, f'requiredStages[{sid}].nodeType 与 steps 定义不一致')
    for gid in p.get('hardGates') or []:
        if gid not in ids:
            err(r, f'hardGates 引用未知 step: {gid}')
    gates = p.get('gates') or {}
    for gid, g in gates.items():
        if gid not in ids:
            err(r, f'gates 引用未知 step: {gid}')
        gd = g.get('ruleFile')
        if gd and not (pack / gd).is_file():
            err(r, f'gates[{gid}].ruleFile 不存在: {gd}')
    for name, rel in (p.get('rules') or {}).items():
        if not (pack / rel).is_file():
            err(r, f'rules[{name}] 指向不存在文件: {rel}')
    for name, rel in (p.get('knowledge') or {}).items():
        if not (pack / rel).is_file():
            err(r, f'knowledge[{name}] 指向不存在文件: {rel}')
    cd = p.get('configDigest') or {}
    for mode in ('premium_mode', 'comic_mode'):
        agent = (cd.get(mode) or {}).get('agent')
        if agent and not (pack / agent).is_file():
            err(r, f'configDigest.{mode}.agent 不存在: {agent}')
    r['stats'] = {
        'steps': len(steps),
        'auxStepTemplates': len(aux),
        'stepOrder': {k: len(v) for k, v in order.items()},
        'hardGates': p.get('hardGates') or [],
        'rules': len(p.get('rules') or {}),
        'knowledge': len(p.get('knowledge') or {}),
        'requiredStages': len(required),
        'nodeTypeNullSteps': [s.get('id') for s in steps + aux if s.get('nodeType') is None],
        'lowConfidenceNodeType': [
            {'id': s.get('id'), 'nodeType': s.get('nodeType'), 'confidence': s.get('nodeTypeConfidence')}
            for s in steps + aux
            if s.get('nodeTypeConfidence') in ('low', 'medium', 'none')
        ],
    }
    return r


# ── ④ cross-references ────────────────────────────────────────────────────
def check_references(pack: pathlib.Path, manifest: dict | None):
    r = result('cross-references', '包内交叉引用命中',
               '路径引用 / markdown 相对链接 / {{rules:...}} 占位符在包内可解析；'
               '已知源包断链与外部资产见 manifest.knownMissingReferences / knownExternalReferences')
    known_missing = {}
    known_external = []
    if manifest:
        for item in manifest.get('knownMissingReferences') or []:
            for key in ('ref', 'bareName'):
                if item.get(key):
                    known_missing[item[key]] = item.get('reason', '')
        for item in manifest.get('knownExternalReferences') or []:
            known_external.append(item)
    path_set = {str(p.relative_to(pack)) for p in pack.rglob('*') if p.is_file()}
    basenames = {pathlib.PurePosixPath(p).name for p in path_set}
    rules = set((manifest or {}).get('rules') or {})
    aliases = set((manifest or {}).get('ruleAliases') or {})
    rule_stems = {pathlib.PurePosixPath(p).stem for p in path_set if kind_of(p) in ('rule', 'core-rule')}

    def external_match(ref: str, resolved: str) -> bool:
        for item in known_external:
            for pre in ([item['prefix']] if item.get('prefix') else []) + (item.get('prefixes') or []):
                if ref.startswith(pre) or resolved.startswith(pre):
                    return True
            if ref in (item.get('bareNames') or []):
                return True
        return False

    counts = Counter()
    unresolved = []
    exempted = []
    files = sorted(path_set)
    for rel in files:
        kind = kind_of(rel)
        if kind not in REF_SCAN_KINDS:
            continue
        if not rel.endswith(('.md', '.toml')):
            continue
        text = (pack / rel).read_text(encoding='utf-8')
        lines = text.splitlines()
        for lineno, line in enumerate(lines, 1):
            for m in DIR_REF_RE.finditer(line):
                ref = m.group(1)
                counts['dirRefs'] += 1
                if ref in path_set:
                    continue
                if ref in known_missing:
                    exempted.append({'ref': ref, 'at': f'{rel}:{lineno}', 'kind': 'knownMissing'})
                    continue
                unresolved.append({'type': 'dirRef', 'ref': ref, 'at': f'{rel}:{lineno}'})
            for m in LINK_RE.finditer(line):
                target = m.group(1)
                if target.startswith(('http://', 'https://', 'mailto:', '#')):
                    continue
                counts['links'] += 1
                base = target.split('#')[0]
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(rel), base))
                if resolved in path_set:
                    continue
                if base in known_missing or target in known_missing:
                    exempted.append({'ref': target, 'at': f'{rel}:{lineno}', 'kind': 'knownMissing'})
                    continue
                if external_match(target, resolved) or resolved.startswith('..'):
                    exempted.append({'ref': target, 'at': f'{rel}:{lineno}', 'kind': 'external'})
                    continue
                unresolved.append({'type': 'link', 'ref': target, 'at': f'{rel}:{lineno}'})
            for m in PLACEHOLDER_RE.finditer(line):
                name = m.group(1)
                counts['placeholders'] += 1
                if name in rules or name in aliases or name in rule_stems:
                    continue
                unresolved.append({'type': 'placeholder', 'ref': name, 'at': f'{rel}:{lineno}'})
            for m in BARE_MD_RE.finditer(line):
                name = m.group(1)
                if name in basenames:
                    continue
                counts['bareNamesMissing'] += 1
                if name in known_missing or any(name in (x.get('bareNames') or []) for x in known_external):
                    exempted.append({'ref': name, 'at': f'{rel}:{lineno}', 'kind': 'externalOrKnownMissing'})
                    continue
                warn(r, f'{rel}:{lineno} 裸文件名提及在包内不存在: {name}（prose 提及，不判 error）')
    for item in unresolved:
        err(r, f"{item['type']} 未命中: {item['ref']} @ {item['at']}")
    r['stats'] = {
        'scannedFiles': len([x for x in files if kind_of(x) in REF_SCAN_KINDS and x.endswith(('.md', '.toml'))]),
        **dict(counts),
        'unresolved': len(unresolved),
        'exempted': len(exempted),
        'exemptedDetail': exempted,
        'knownMissing': sorted(known_missing),
        'knownExternal': len(known_external),
    }
    return r


# ── ⑤ duplicate-names ─────────────────────────────────────────────────────
RULE_NAMESPACES = {
    'rule-stems': lambda rel: (kind_of(rel) in ('rule', 'core-rule'), pathlib.PurePosixPath(rel).stem),
    'step-names': lambda rel: (kind_of(rel) == 'step', pathlib.PurePosixPath(rel).name),
    'agent-names': lambda rel: (kind_of(rel) == 'agent', pathlib.PurePosixPath(rel).name),
    'knowledge-names': lambda rel: (kind_of(rel) in ('knowledge', 'rag-card'), pathlib.PurePosixPath(rel).name),
    'template-names': lambda rel: (kind_of(rel) == 'template', pathlib.PurePosixPath(rel).name),
}


def check_duplicates(pack: pathlib.Path):
    r = result('duplicate-names', '重复文件名冲突',
               '可寻址命名空间（规则 / step / agent / 知识 / 模板）内 basename 必须唯一；'
               '跨 kind 的同名文档按路径寻址，仅告警')
    files = sorted(str(p.relative_to(pack)) for p in pack.rglob('*') if p.is_file())
    details = {}
    conflict = False
    for ns, fn in RULE_NAMESPACES.items():
        buckets = {}
        for rel in files:
            hit, key = fn(rel)
            if hit:
                buckets.setdefault(key, []).append(rel)
        dups = {k: v for k, v in buckets.items() if len(v) > 1}
        details[ns] = {'names': len(buckets), 'duplicates': dups}
        for k, v in dups.items():
            conflict = True
            err(r, f'{ns} 命名冲突 {k!r}: {v}')
    all_buckets = {}
    for rel in files:
        all_buckets.setdefault(pathlib.PurePosixPath(rel).name, []).append(rel)
    cross = {k: v for k, v in all_buckets.items() if len(v) > 1}
    for k, v in sorted(cross.items()):
        if not any(k in (d.get('duplicates') or {}) for d in details.values()):
            warn(r, f'跨 kind 同名文件 {k!r}: {v}（按路径寻址，不构成命名冲突）')
    r['stats'] = {
        'namespaces': details,
        'crossKindSameName': cross,
    }
    return r


# ── 报告 ──────────────────────────────────────────────────────────────────
def render_human(pack: pathlib.Path, checks: list, manifest: dict | None) -> str:
    total_err = sum(len(c['errors']) for c in checks)
    total_warn = sum(len(c['warnings']) for c in checks)
    out = []
    out.append('=' * 78)
    out.append('规则包 v2 校验报告 (rules_lint.py)')
    out.append(f'pack: {pack}')
    out.append(f'manifest: {"有" if manifest else "无"}')
    out.append(f'结果: {"PASS" if total_err == 0 else "FAIL"}  '
               f'(errors={total_err}, warnings={total_warn})')
    out.append('=' * 78)
    for c in checks:
        mark = 'PASS' if c['passed'] else 'FAIL'
        out.append(f"\n[{mark}] {c['id']} — {c['title']}")
        out.append(f"       {c['description']}")
        stats = json.dumps(c['stats'], ensure_ascii=False)
        out.append(f"       stats: {stats}")
        for e in c['errors']:
            out.append(f"  ERROR   {e}")
        for w in c['warnings'][:20]:
            out.append(f"  WARN    {w}")
        if len(c['warnings']) > 20:
            out.append(f"  WARN    ... 另有 {len(c['warnings']) - 20} 条（见 --json）")
    out.append('')
    out.append('-' * 78)
    if manifest:
        cnt = manifest.get('counts') or {}
        out.append(f"包统计: packFiles={cnt.get('packFiles')}（不含 manifest.json 自身；含则 {cnt.get('packFilesWithManifest')}）, "
                   f"bytes={cnt.get('packBytes')}, migrated={cnt.get('migratedFiles')}, "
                   f"skipped={cnt.get('skippedFiles')}")
        out.append(f"字数口径 {manifest.get('wordsUnit')}: "
                   f"textCharsNoWhitespace={cnt.get('textCharsNoWhitespace')}")
    out.append(f"结论: {'全部检查通过，退出码 0' if total_err == 0 else '存在 error，退出码 1'}")
    return '\n'.join(out) + '\n'


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='规则包 v2 确定性校验（5 项）')
    ap.add_argument('--pack', default=None, help='规则包目录（默认按脚本位置推断 moxi/rules/v2）')
    ap.add_argument('--json', action='store_true', help='只输出 JSON（机器可读）')
    ap.add_argument('--json-out', default=None, help='把 JSON 报告写入文件（同时仍输出人类可读报告）')
    ap.add_argument('--strict', action='store_true', help='warning 也判失败')
    ap.add_argument('-q', '--quiet', action='store_true', help='人类可读报告只输出结论行')
    args = ap.parse_args(argv)

    if args.pack:
        pack = pathlib.Path(args.pack).resolve()
    else:
        pack = pathlib.Path(__file__).resolve().parents[1] / 'rules' / 'v2'
    if not pack.is_dir():
        print(f'[rules_lint] pack 目录不存在: {pack}', file=sys.stderr)
        return 1

    manifest = None
    if (pack / 'manifest.json').is_file():
        try:
            manifest = json.loads((pack / 'manifest.json').read_text(encoding='utf-8'))
        except json.JSONDecodeError:
            manifest = None

    checks = [
        check_manifest_sync(pack),
        check_titles(pack),
        check_pipeline(pack),
        check_references(pack, manifest),
        check_duplicates(pack),
    ]
    total_err = sum(len(c['errors']) for c in checks)
    total_warn = sum(len(c['warnings']) for c in checks)
    passed = total_err == 0 and not (args.strict and total_warn)

    report = OrderedDict([
        ('ok', passed),
        ('pack', str(pack)),
        ('exitCode', 0 if passed else 1),
        ('errors', total_err),
        ('warnings', total_warn),
        ('checks', checks),
    ])
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    if args.json_out:
        pathlib.Path(args.json_out).write_text(payload + '\n', encoding='utf-8')
    if args.json:
        print(payload)
    else:
        human = render_human(pack, checks, manifest)
        if args.quiet:
            print(human.strip().splitlines()[-1])
        else:
            sys.stdout.write(human)
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
