import os
import sys
import xmlrpc.client as xmlrpclib


def main() -> int:
    url = os.environ.get("ODOO_URL")
    database = os.environ.get("ODOO_DB")
    username = os.environ.get("ODOO_USERNAME")
    password = os.environ.get("ODOO_PASSWORD")

    missing = [name for name, value in [
        ("ODOO_URL", url),
        ("ODOO_DB", database),
        ("ODOO_USERNAME", username),
        ("ODOO_PASSWORD", password),
    ] if not value]

    if missing:
        print(f"Missing required environment variables: {', '.join(missing)}")
        return 1

    try:
        common = xmlrpclib.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
        version = common.version()
    except Exception as exc:  # pragma: no cover - network failure logging
        print(f"Failed to reach Odoo common service: {exc}")
        return 1

    print(
        "Connected to Odoo XML-RPC common endpoint.",
        f"Server version: {version.get('server_version', 'unknown')}",
    )

    try:
        uid = common.authenticate(database, username, password, {})
    except Exception as exc:  # pragma: no cover - network failure logging
        print(f"Authentication request failed: {exc}")
        return 1

    if not uid:
        print("Authentication failed. Please verify credentials.")
        return 1

    print(f"Authentication succeeded. User ID: {uid}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
