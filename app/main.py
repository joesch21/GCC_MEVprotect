from flask import Flask

from .routes.api import bp as api_bp
from .routes.ui import bp as ui_bp
from .db import init_db


def create_app() -> Flask:
    init_db()
    app = Flask(__name__)
    app.register_blueprint(api_bp)
    app.register_blueprint(ui_bp)
    return app
