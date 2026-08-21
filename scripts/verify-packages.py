#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path, PurePosixPath
from zipfile import ZipFile


REPO_ROOT = Path(__file__).resolve().parent.parent
SKILLS = ("htx-huobao-fast", "htx-brand")
TEXT_SUFFIXES = {".md", ".mjs", ".js", ".py", ".yaml", ".yml", ".json", ".svg"}


def source_files(skill_name: str) -> set[str]:
    root = REPO_ROOT / "skills" / skill_name
    return {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and path.name != ".DS_Store"
    }


def validate_skill(skill_name: str) -> None:
    skill_file = REPO_ROOT / "skills" / skill_name / "SKILL.md"
    text = skill_file.read_text(encoding="utf-8")
    if not text.startswith("---\n") or "\n---\n" not in text[4:]:
        raise SystemExit(f"{skill_file}: invalid YAML frontmatter boundary")
    frontmatter = text.split("---\n", 2)[1]
    fields = {}
    for line in frontmatter.splitlines():
        if ":" not in line:
            raise SystemExit(f"{skill_file}: invalid frontmatter line {line!r}")
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip()
    if set(fields) != {"name", "description"}:
        raise SystemExit(f"{skill_file}: frontmatter must contain only name and description")
    if fields["name"] != skill_name:
        raise SystemExit(f"{skill_file}: name must match directory")
    if not fields["description"]:
        raise SystemExit(f"{skill_file}: description must not be empty")


def validate_archive(skill_name: str, suffix: str) -> None:
    package = REPO_ROOT / "downloads" / f"{skill_name}{suffix}"
    expected = source_files(skill_name)
    prefix = "" if suffix == ".skill" else f"{skill_name}/"

    with ZipFile(package) as archive:
        names = {name for name in archive.namelist() if not name.endswith("/")}
        normalized = {name.removeprefix(prefix) for name in names}
        if normalized != expected:
            missing = sorted(expected - normalized)
            extra = sorted(normalized - expected)
            raise SystemExit(f"{package.name}: content mismatch; missing={missing}, extra={extra}")

        for name in names:
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts:
                raise SystemExit(f"{package.name}: unsafe path {name}")
            if Path(name).suffix.lower() in TEXT_SUFFIXES:
                text = archive.read(name).decode("utf-8")
                if "/Users/niko.ren" in text:
                    raise SystemExit(f"{package.name}: local absolute path found in {name}")

    required = {f"{prefix}SKILL.md"}
    if not required.issubset(names):
        raise SystemExit(f"{package.name}: missing SKILL.md")
    if skill_name == "htx-huobao-fast" and not any(name.startswith(f"{prefix}scripts/") for name in names):
        raise SystemExit(f"{package.name}: missing scripts/")
    if not any(name.startswith(f"{prefix}assets/") for name in names):
        raise SystemExit(f"{package.name}: missing assets/")

    print(f"OK {package.name}: {len(names)} files")


for name in SKILLS:
    validate_skill(name)
    validate_archive(name, ".skill")
    validate_archive(name, ".zip")
