#!/usr/bin/env python3
"""dcl: herramientas del kit de proceso DCL. Solo biblioteca estandar.

Subcomandos:
  doc-check      valida ROADMAP, TASKS, ARCHIVES, planes, ADR y verificaciones
  release-check  valida un tag contra manifiestos, CHANGELOG y rama main
  gate-report    lista gates abiertos con su edad en versiones
  process-init   instala el kit en un proyecto (solo desde el repo dcl-os)

La configuracion vive en .dcl/config.json (generada por process-init desde un perfil)
o se pasa con --config (JSON, o YAML si PyYAML esta disponible).
No modifica nunca documentos del proyecto: solo lee y reporta (salvo process-init, que no pisa archivos).
"""
from __future__ import annotations

import argparse
import fnmatch
import glob
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_DOC = {
    "roadmap": "ROADMAP.md",
    "tasks": "TASKS.md",
    "archives": "ARCHIVES.md",
    "planes": "docs/plan/*.md",
    "verificaciones": "docs/verification/*.md",
    "adrs": "docs/adr/*.md",
    "primera_version_con_plantilla": 1,
}
SEP = r"[:\u2014\u2013-]"
VER_RE = re.compile(r"v(\d+)\.(\d+)")
PLAN_SECTIONS = [
    "origen y alcance vigente",
    "contexto observado en el código",
    "decisiones",
    "contrato técnico",
    "matriz de aceptación",
    "tareas y dependencias",
    "riesgos y criterios de cierre",
]
VERIF_SECTIONS = ["suites", "límites y gates pendientes"]
ADR_STATUS = re.compile(
    r"^(proposed|accepted|superseded|propuesto|aceptado|reemplazado)\b", re.I
)
STATE_OK = re.compile(r"^(planificada|publicada v\d+\.\d+\.\d+)$", re.I)


# ----------------------------------------------------------------- utilidades
def load_config(root: Path, config_path: str | None) -> dict:
    p = Path(config_path) if config_path else root / ".dcl" / "config.json"
    cfg: dict = {}
    if p.exists():
        text = p.read_text(encoding="utf-8")
        if p.suffix in (".yaml", ".yml"):
            import yaml  # type: ignore

            cfg = yaml.safe_load(text) or {}
        else:
            cfg = json.loads(text)
    doc = dict(DEFAULT_DOC)
    doc.update(cfg.get("doc_check", {}) or {})
    cfg["doc_check"] = doc
    return cfg


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""


def slug(heading: str) -> str:
    s = heading.strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    return re.sub(r"\s", "-", s)


def headings(text: str):
    """Devuelve (nivel, texto) de encabezados fuera de bloques de codigo."""
    out, fence = [], False
    for line in text.splitlines():
        if line.strip().startswith("```"):
            fence = not fence
            continue
        if fence:
            continue
        m = re.match(r"^(#{1,6})\s+(.*?)\s*$", line)
        if m:
            out.append((len(m.group(1)), m.group(2)))
    return out


def strip_comments(text: str) -> str:
    return re.sub(r"<!--.*?-->", "", text, flags=re.S)


def parse_roadmap(text: str):
    """Filas de la tabla de secuencia: [(major, minor, estado, titulo)]."""
    rows = []
    for line in strip_comments(text).splitlines():
        m = re.match(r"^\|\s*v(\d+)\.(\d+)\s*\|(.*)$", line)
        if not m:
            continue
        cells = [c.strip().strip("*").strip() for c in m.group(3).split("|")]
        titulo = cells[0] if cells else ""
        estado = cells[1] if len(cells) > 1 else ""
        rows.append((int(m.group(1)), int(m.group(2)), estado, titulo))
    return rows


def published(rows):
    out = []
    for ma, mi, estado, _ in rows:
        if re.match(r"^publicada\b", estado, re.I):
            out.append((ma, mi))
    return out


class Report:
    def __init__(self):
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, rule, msg):
        self.errors.append(f"[{rule}] {msg}")

    def warn(self, rule, msg):
        self.warnings.append(f"[{rule}] {msg}")


# ------------------------------------------------------------------ doc-check
def doc_check(root: Path, cfg: dict) -> Report:
    d = cfg["doc_check"]
    first = int(d.get("primera_version_con_plantilla", 1))
    rep = Report()

    rm_path = root / d["roadmap"]
    if not rm_path.exists():
        rep.err("R0", f"falta {d['roadmap']}")
        return rep
    rows = parse_roadmap(read(rm_path))
    if not rows:
        rep.err("R1", f"{d['roadmap']}: no se encontró la tabla de secuencia (filas '| vX.Y | ...')")
        return rep

    # R1: tabla consecutiva, estados permitidos, orden publicada/planificada
    seen = set()
    prev = None
    for ma, mi, estado, titulo in rows:
        key = (ma, mi)
        if key in seen:
            rep.err("R1", f"versión repetida en el roadmap: v{ma}.{mi}")
        seen.add(key)
        if not STATE_OK.match(estado):
            rep.err("R1", f"v{ma}.{mi}: estado no permitido '{estado}' (usa Planificada o Publicada vX.Y.Z)")
        if prev and prev[0] == ma and mi != prev[1] + 1 and key not in (prev,):
            rep.err("R1", f"salto en la secuencia: v{prev[0]}.{prev[1]} seguido de v{ma}.{mi}")
        prev = key
    seen_planned = False
    for ma, mi, estado, _ in rows:
        if re.match(r"^planificada", estado, re.I):
            seen_planned = True
        elif re.match(r"^publicada", estado, re.I) and seen_planned:
            rep.err("R1", f"v{ma}.{mi} está Publicada después de una Planificada")

    pub = published(rows)
    pub_set = set(pub)

    # R2: TASKS sin cola de versiones publicadas; IDs unicos
    tasks_text = strip_comments(read(root / d["tasks"]))
    if (root / d["tasks"]).exists():
        for lvl, h in headings(tasks_text):
            m = re.match(r"^v(\d+)\.(\d+)\b", h)
            if m and (int(m.group(1)), int(m.group(2))) in pub_set:
                rep.err("R2", f"{d['tasks']}: la cola de v{m.group(1)}.{m.group(2)} sigue ahí pero está Publicada (debe ir a {d['archives']})")
        ids: dict[str, int] = {}
        id_re = re.compile(r"^\s*- \[[ xX]\] \*\*([A-Za-z][A-Za-z0-9._-]*?)(?:: |\s+[\u2014\u2013-]\s+|\*\*)")
        for line in tasks_text.splitlines():
            m = id_re.match(line)
            if m:
                ids[m.group(1)] = ids.get(m.group(1), 0) + 1
        for i, n in ids.items():
            if n > 1:
                rep.err("R2", f"{d['tasks']}: ID de tarea repetido '{i}' ({n} veces)")
    else:
        rep.warn("R2", f"no existe {d['tasks']}")

    # R3: ARCHIVES con sección por versión publicada e índice válido
    ar_path = root / d["archives"]
    if ar_path.exists():
        ar = strip_comments(read(ar_path))
        hs = headings(ar)
        slugs = {slug(h) for _, h in hs}
        for ma, mi in pub:
            if mi < first and ma == 0:
                continue
            if not any(re.match(rf"^v?{ma}\.{mi}\b", h) for _, h in hs):
                rep.err("R3", f"{d['archives']}: falta la sección de v{ma}.{mi}")
        in_code = False
        for line in ar.splitlines():
            if line.strip().startswith("```"):
                in_code = not in_code
            if in_code:
                continue
            for m in re.finditer(r"\[[^\]]+\]\(#([^)]+)\)", line):
                if m.group(1) not in slugs:
                    rep.err("R3", f"{d['archives']}: el índice enlaza a '#{m.group(1)}' que no existe")
    elif pub:
        rep.err("R3", f"falta {d['archives']} pero hay versiones publicadas")

    # R4: planes y verificaciones
    def version_of(name: str):
        m = VER_RE.search(name)
        return (int(m.group(1)), int(m.group(2))) if m else None

    for f in sorted(glob.glob(str(root / d["planes"]))):
        v = version_of(Path(f).name)
        if not v or (v[0] == 0 and v[1] < first):
            continue
        hs = [h.lower() for _, h in headings(strip_comments(read(Path(f))))]
        for sec in PLAN_SECTIONS:
            if not any(h.startswith(sec) for h in hs):
                rep.err("R4", f"{Path(f).name}: falta la sección '{sec}'")
    for f in sorted(glob.glob(str(root / d["verificaciones"]))):
        v = version_of(Path(f).name)
        if not v or (v[0] == 0 and v[1] < first):
            continue
        hs = [h.lower() for _, h in headings(strip_comments(read(Path(f))))]
        for sec in VERIF_SECTIONS:
            if not any(h.startswith(sec) for h in hs):
                rep.err("R4", f"{Path(f).name}: falta la sección '{sec}'")

    # R5: ADR con estado permitido
    for f in sorted(glob.glob(str(root / d["adrs"]))):
        name = Path(f).name
        if not re.match(r"^\d{4}", name):
            continue
        lines = strip_comments(read(Path(f))).splitlines()
        status = None
        for i, line in enumerate(lines):
            if re.match(r"^#{1,3}\s+(status|estado)\s*$", line, re.I):
                for nxt in lines[i + 1:]:
                    if nxt.strip():
                        status = nxt.strip().lstrip("*-_ ").strip()
                        break
                break
        if status is None:
            rep.err("R5", f"{name}: no tiene sección Status/Estado")
        elif not ADR_STATUS.match(status):
            rep.err("R5", f"{name}: estado no permitido '{status[:60]}'")

    # R6 (opcional): README con una sola línea 'Latest'
    if cfg.get("readme_latest") and (root / "README.md").exists():
        n = len(re.findall(r"^##\s+Latest\b", read(root / "README.md"), re.M))
        if n != 1:
            rep.err("R6", f"README.md: se esperaba una sola sección '## Latest', hay {n}")

    return rep


# ---------------------------------------------------------------- gate-report
def gate_report(root: Path, cfg: dict, max_age: int = 2):
    d = cfg["doc_check"]
    rows = parse_roadmap(read(root / d["roadmap"]))
    pub = published(rows)
    latest = max((mi for ma, mi in pub), default=None)
    text = strip_comments(read(root / d["tasks"]))
    blocks, cur = [], []
    for line in text.splitlines():
        if re.match(r"^\s*- \[[ xX]\] ", line):
            if cur:
                blocks.append(cur)
            cur = [line]
        elif cur and (line.startswith(" ") or not line.strip()):
            cur.append(line)
        else:
            if cur:
                blocks.append(cur)
            cur = []
    if cur:
        blocks.append(cur)
    gates = []
    for b in blocks:
        body = "\n".join(b)
        if "Pendiente, sin evidencia" not in body:
            continue
        m = re.match(r"^\s*- \[[ xX]\] \*\*([A-Za-z][A-Za-z0-9._-]*)", b[0])
        gid = m.group(1) if m else "?"
        ver = None
        mv = re.match(r"^V(\d+)-VERIFY$", gid)
        if mv:
            ver = int(mv.group(1))
        else:
            vs = [int(x.group(2)) for x in VER_RE.finditer(body)]
            if vs:
                ver = min(vs)
        age = (latest - ver) if (latest is not None and ver is not None) else None
        gates.append({"id": gid, "version_minor": ver, "age": age,
                      "vencido": age is not None and age > max_age})
    return {"ultima_publicada_minor": latest, "max_age": max_age, "gates": gates}


# -------------------------------------------------------------- release-check
def _read_manifest_value(path: Path, tipo: str, clave: str):
    text = read(path)
    if not text:
        return None
    if tipo == "json":
        data = json.loads(text)
        for part in clave.split("."):
            data = data.get(part) if isinstance(data, dict) else None
        return data
    # toml
    try:
        import tomllib  # type: ignore

        data = tomllib.loads(text)
        for part in clave.split("."):
            data = data.get(part) if isinstance(data, dict) else None
        return data
    except ImportError:
        pass
    *sec, key = clave.split(".")
    header = "[" + ".".join(sec) + "]" if sec else None
    in_sec = header is None
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("["):
            in_sec = (s == header) if header else False
            continue
        if in_sec:
            m = re.match(rf'^{re.escape(key)}\s*=\s*"([^"]+)"', s)
            if m:
                return m.group(1)
    return None


def release_check(root: Path, cfg: dict, tag: str, skip_git: bool = False) -> Report:
    rep = Report()
    version = tag[1:] if tag.startswith("v") else tag
    for man in cfg.get("manifiestos", []) or []:
        p = root / man["archivo"]
        if not p.exists():
            if man.get("opcional"):
                continue
            rep.err("RC1", f"falta el manifiesto {man['archivo']}")
            continue
        val = _read_manifest_value(p, man["tipo"], man["clave"])
        if val is None:
            if not man.get("opcional"):
                rep.err("RC1", f"{man['archivo']}: no se encontró {man['clave']}")
        elif val != version:
            rep.err("RC1", f"{man['archivo']}: {man['clave']} es {val}, el tag pide {version}")
    cl = read(root / cfg.get("changelog", "CHANGELOG.md"))
    m = re.search(rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## \[|\Z)", cl, re.M | re.S)
    if not m:
        rep.err("RC2", f"CHANGELOG: no existe la sección ## [{version}]")
    elif not m.group(1).strip():
        rep.err("RC2", f"CHANGELOG: la sección [{version}] está vacía")
    if not skip_git:
        try:
            r = subprocess.run(["git", "-C", str(root), "merge-base", "--is-ancestor", tag, "main"],
                               capture_output=True, text=True)
            if r.returncode == 1:
                rep.err("RC3", f"el tag {tag} no es ancestro de main")
            elif r.returncode > 1:
                rep.warn("RC3", f"no se pudo comprobar el tag contra main: {r.stderr.strip()[:80]}")
        except FileNotFoundError:
            rep.warn("RC3", "git no disponible")
    return rep


# --------------------------------------------------------------- process-init
def process_init(kit: Path, profile_name: str, target: Path, project: str, today: str):
    prof_file = kit / "perfiles" / f"{profile_name}.yaml"
    if not prof_file.exists():
        sys.exit(f"perfil no encontrado: {prof_file}")
    import yaml  # type: ignore

    prof = yaml.safe_load(prof_file.read_text(encoding="utf-8"))
    created, skipped = [], []

    def put(rel: str, content: str, mode: int | None = None):
        p = target / rel
        if p.exists():
            skipped.append(rel)
            return
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        if mode:
            p.chmod(mode)
        created.append(rel)

    subs = {"{{PROYECTO}}": project, "{{FECHA}}": today, "{{ULTIMA_PUBLICADA}}": "ninguna",
            "{{PROXIMA}}": "v0.1", "{{PRIMERA_ENTREGA}}": "(por definir)",
            "{{DESCRIPCION_UNA_LINEA}}": "(describe el proyecto en una línea)",
            "{{COMANDOS_DEL_PERFIL}}": "\n".join(f"- {k}: `{v}`" for k, v in (prof.get("comandos") or {}).items() if v)}

    def render(text: str) -> str:
        for k, v in subs.items():
            text = text.replace(k, v)
        return text

    for name in ["ROADMAP.md", "TASKS.md", "ARCHIVES.md", "CHANGELOG.md", "CLAUDE.md"]:
        put(name, render(read(kit / "plantillas" / name)))
    for pf in sorted((kit / "protocolos").glob("*.md")):
        put(f"docs/protocols/{pf.name}", read(pf))
    for sub in ("plan", "adr", "verification"):
        put(f"docs/{sub}/.gitkeep", "")
    for h in prof.get("hooks", []):
        put(f".dcl/hooks/{h}", read(kit / "hooks" / h), 0o755)
    put(".dcl/install-git-hooks.sh", read(kit / "hooks" / "install-git-hooks.sh"), 0o755)
    put(".dcl/dcl.py", read(kit / "dcl.py"), 0o755)
    cfg = {k: prof[k] for k in ("nombre", "doc_check", "manifiestos", "comandos", "changelog", "readme_latest") if k in prof}
    put(".dcl/config.json", json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
    for wf in prof.get("workflows", []):
        src = kit / "workflows" / profile_name / wf
        if src.exists():
            put(f".github/workflows/{wf}", read(src))
    return created, skipped


# ----------------------------------------------------------------------- main
def print_report(rep: Report, ok_msg: str) -> int:
    for w in rep.warnings:
        print("aviso", w)
    for e in rep.errors:
        print("error", e)
    if rep.errors:
        print(f"\n{len(rep.errors)} error(es)")
        return 1
    print(ok_msg)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="dcl", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p):
        p.add_argument("--root", default=".")
        p.add_argument("--config", default=None)

    p = sub.add_parser("doc-check"); common(p)
    p = sub.add_parser("release-check"); common(p)
    p.add_argument("tag"); p.add_argument("--skip-git", action="store_true")
    p = sub.add_parser("gate-report"); common(p)
    p.add_argument("--max-age", type=int, default=2); p.add_argument("--json", action="store_true")
    p = sub.add_parser("process-init")
    p.add_argument("--profile", required=True); p.add_argument("--target", required=True)
    p.add_argument("--name", required=True); p.add_argument("--kit", default=str(Path(__file__).parent))
    p.add_argument("--date", default=None)

    a = ap.parse_args(argv)
    if a.cmd == "process-init":
        import datetime
        today = a.date or datetime.date.today().isoformat()
        created, skipped = process_init(Path(a.kit), a.profile, Path(a.target), a.name, today)
        print(f"creados: {len(created)}")
        for c in created:
            print("  +", c)
        for s in skipped:
            print("  = ya existía, no se tocó:", s)
        return 0

    root = Path(a.root).resolve()
    cfg = load_config(root, a.config)
    if a.cmd == "doc-check":
        return print_report(doc_check(root, cfg), "doc-check: todo en orden")
    if a.cmd == "release-check":
        return print_report(release_check(root, cfg, a.tag, a.skip_git), f"release-check {a.tag}: todo en orden")
    if a.cmd == "gate-report":
        rpt = gate_report(root, cfg, a.max_age)
        if a.json:
            print(json.dumps(rpt, indent=2, ensure_ascii=False))
            return 0
        print(f"Última versión publicada: 0.{rpt['ultima_publicada_minor']}  (umbral: {rpt['max_age']} versiones)")
        for g in rpt["gates"]:
            edad = "edad desconocida" if g["age"] is None else f"{g['age']} versiones"
            flag = "  VENCIDO: decisión de David pendiente" if g["vencido"] else ""
            print(f"- {g['id']}: {edad}{flag}")
        if not rpt["gates"]:
            print("Sin gates abiertos.")
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
