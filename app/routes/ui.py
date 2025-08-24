from flask import Blueprint, render_template

bp = Blueprint("ui", __name__)


@bp.route("/")
def index():
    return render_template("index.html")


@bp.route("/import")
def import_page():
    return render_template("import.html")
