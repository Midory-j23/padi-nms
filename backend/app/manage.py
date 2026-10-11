"""Command-line account recovery, run on the server (nobody can use it remotely).

    python -m app.manage list
    python -m app.manage reset-password USERNAME
    python -m app.manage create-admin USERNAME
"""
import getpass
import sys
import time

from app import auth
from app.auth import db


def _ask_password() -> str:
    pw = getpass.getpass("New password (min 8 characters): ")
    if pw != getpass.getpass("Repeat password: "):
        sys.exit("The two passwords do not match.")
    return pw


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in ("list", "reset-password", "create-admin"):
        print(__doc__)
        return 2
    cmd = argv[0]
    with db() as con:
        if cmd == "list":
            for r in con.execute("SELECT username, role, active FROM users ORDER BY username"):
                print(f"{r['username']:24s} {r['role']:9s} {'active' if r['active'] else 'disabled'}")
            return 0
        if len(argv) < 2:
            print(__doc__)
            return 2
        username = auth.check_username(argv[1])
        row = con.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if cmd == "reset-password" and not row:
            sys.exit(f"No user named '{username}'.")
        if cmd == "create-admin" and row:
            sys.exit(f"'{username}' already exists. Use reset-password instead.")
        password = _ask_password()
        auth.check_new_password(password, username)
        if cmd == "reset-password":
            con.execute("UPDATE users SET password_hash = ?, active = 1 WHERE id = ?", (auth.hash_password(password), row["id"]))
            auth.revoke_sessions(con, row["id"])
            print(f"Password changed for '{username}'. They have been signed out everywhere.")
        else:
            con.execute("INSERT INTO users (username, full_name, password_hash, role, active, created_at) VALUES (?,?,?,?,1,?)",
                        (username, "", auth.hash_password(password), "admin", time.time()))
            print(f"Admin '{username}' created.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
