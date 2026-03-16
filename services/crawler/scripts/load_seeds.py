from app.core.settings import settings
from app.pipeline.seeds import enqueue_seeds


if __name__ == "__main__":
    print(f"Enqueued {enqueue_seeds(settings.seed_config_path)} seeds")

