"""Serve the repository with explicit MIME types, including on Windows."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.wasm': 'application/wasm',
        '.json': 'application/json',
        '.onnx': 'application/octet-stream',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8002)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent

    def handler(*args, **kwargs):
        return Handler(*args, directory=str(root), **kwargs)

    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        print(f'http://127.0.0.1:{args.port}/yolo-camera/detectsample_camera_yolo.html', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
