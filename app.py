import os

from flask import Flask

from config import FLASK_DEBUG, FLASK_HOST, FLASK_PORT
from db import init_db
from rebuilder import sync_database

app = Flask(__name__)


from blueprints.import_api import bp as import_api_bp
from blueprints.library_api import bp as library_api_bp
from blueprints.pages import bp as pages_bp
from blueprints.planner_api import bp as planner_api_bp
from blueprints.system_api import bp as system_api_bp
from blueprints.tags_api import bp as tags_api_bp

app.register_blueprint(pages_bp)
app.register_blueprint(import_api_bp)
app.register_blueprint(library_api_bp)
app.register_blueprint(tags_api_bp)
app.register_blueprint(planner_api_bp)
app.register_blueprint(system_api_bp)


def startup():
    init_db()
    sync_database()


if __name__ == "__main__":
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not FLASK_DEBUG:
        startup()
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=FLASK_DEBUG)
