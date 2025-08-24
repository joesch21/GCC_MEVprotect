import pytest

from app.main import create_app
from app.db import SessionLocal, engine
from app.db.models import Base


@pytest.fixture
def app():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app = create_app()
    app.config.update({"TESTING": True})
    return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def session():
    with SessionLocal() as session:
        yield session
