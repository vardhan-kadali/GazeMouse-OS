"""CLI entrypoint for GazeMouse-OS Desktop Input Bridge."""

import argparse
import asyncio
import logging
import os
import signal
import sys

from config import BridgeConfig, TOKEN_FILE_NAME, DEFAULT_HOST, DEFAULT_PORT
from server import BridgeServer

# Configure structured terminal logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("BridgeMain")


import subprocess

def get_current_user_sid() -> str:
    """Retrieves the current user's SID on Windows using whoami.exe."""
    res = subprocess.run(["whoami.exe", "/user"], capture_output=True, text=True, check=True)
    lines = [line.strip() for line in res.stdout.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError("whoami.exe returned empty output")
    sid = lines[-1].split()[-1]
    if not sid.startswith("S-1-"):
        raise RuntimeError(f"Unexpected SID format from whoami.exe: {sid}")
    return sid


def save_token_file_secure(token: str, token_path: str) -> None:
    """
    Saves the active session token to a local file with current-user-only ACLs.
    Fails closed: if ACL application fails on Windows, removes the token file and raises an exception.
    """
    abs_path = os.path.abspath(token_path)
    with open(abs_path, "w", encoding="utf-8") as f:
        f.write(token.strip())

    if sys.platform.startswith("win"):
        try:
            sid = get_current_user_sid()
            cmd = ["icacls.exe", abs_path, "/inheritance:r", "/grant:r", f"*{sid}:(R,W)"]
            res = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if res.returncode != 0 or "Successfully processed 1 files" not in res.stdout:
                raise RuntimeError(
                    f"icacls failed with code {res.returncode}: {res.stderr.strip() or res.stdout.strip()}"
                )
        except Exception as err:
            if os.path.exists(abs_path):
                try:
                    os.remove(abs_path)
                except Exception:
                    pass
            raise RuntimeError(f"Security violation: Failed to enforce token file ACLs: {err}")
    else:
        try:
            os.chmod(abs_path, 0o600)
        except Exception as err:
            if os.path.exists(abs_path):
                try:
                    os.remove(abs_path)
                except Exception:
                    pass
            raise RuntimeError(f"Failed to set file permissions: {err}")



def main() -> None:
    parser = argparse.ArgumentParser(description="GazeMouse-OS Standalone Desktop Input Bridge")
    parser.add_argument("--host", default=DEFAULT_HOST, help="Host to bind (Must be 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port to bind (Default: 8765)")
    parser.add_argument("--token", default=None, help="Explicit authentication token (Auto-generated if omitted)")
    parser.add_argument(
        "--title",
        action="append",
        dest="titles",
        help="Allowed window title keyword (Can be repeated, e.g. --title 'Subway Surfers' --title 'Poki')",
    )
    parser.add_argument(
        "--token-file",
        default=os.path.join(os.path.dirname(__file__), TOKEN_FILE_NAME),
        help="Path where the active session token will be saved",
    )

    args = parser.parse_args()

    # Enforce loopback check
    if args.host not in ("127.0.0.1", "localhost"):
        print(f"Error: Bridge must bind exclusively to loopback (127.0.0.1). Rejected '{args.host}'.", file=sys.stderr)
        sys.exit(1)

    try:
        config = BridgeConfig(
            host=args.host,
            port=args.port,
            allowed_titles=args.titles,
            session_token=args.token,
        )
    except ValueError as ve:
        print(f"Configuration Error: {ve}", file=sys.stderr)
        sys.exit(1)

    # Save session token to file with strict user-only ACLs (fails closed)
    try:
        save_token_file_secure(config.session_token, args.token_file)
    except Exception as e:
        print(f"Startup Security Error: {e}", file=sys.stderr)
        sys.exit(1)

    server = BridgeServer(config)

    print("=" * 65)
    print("  GAZEMOUSE-OS DESKTOP INPUT BRIDGE (PHASE 3 STANDALONE)  ")
    print("=" * 65)
    print(f"  Transport:        ws://{config.host}:{config.port}")
    print(f"  Allowed Origins:  {', '.join(config.allowed_origins)}")
    print(f"  Allowed Windows:  {', '.join(config.allowed_titles)}")
    print(f"  Session Token:    Saved to {args.token_file}")
    print(f"  Emergency Stop:   [Ctrl + Alt + Q] (Global OS Hotkey)")
    print(f"  Exit Daemon:      [Ctrl + C]")
    print(f"  Initial State:    [DISABLED] (Input locked until ENABLE)")
    print("=" * 65)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    stop_event = asyncio.Event()

    def handle_signal():
        logger.info("Shutdown signal received. Stopping bridge...")
        stop_event.set()

    # Handle Ctrl+C on Windows and POSIX
    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, handle_signal)
            except NotImplementedError:
                # Windows signal handlers for asyncio
                pass
    except Exception:
        pass

    async def run():
        await server.start()
        try:
            while not stop_event.is_set():
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass
        finally:
            await server.stop()
            # Clean up token file on exit
            if os.path.exists(args.token_file):
                try:
                    os.remove(args.token_file)
                except Exception:
                    pass

    try:
        loop.run_until_complete(run())
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received.")
        loop.run_until_complete(server.stop())
    finally:
        loop.close()
        logger.info("Bridge process terminated.")


if __name__ == "__main__":
    main()
