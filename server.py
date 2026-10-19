import http.server
import os
import threading
import webbrowser
from pathlib import Path
os.chdir(Path(__file__).parent / 'dist')
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
if os.environ.get('ATLAS_OPEN_BROWSER') == '1':
    threading.Timer(0.5, lambda: webbrowser.open('http://127.0.0.1:4173')).start()
print('Muscle Atlas: http://127.0.0.1:4173', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', 4173), Handler).serve_forever()
