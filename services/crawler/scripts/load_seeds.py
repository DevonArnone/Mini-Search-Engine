from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.settings import settings
from app.pipeline.seeds import enqueue_seeds


if __name__ == "__main__":
    print(f"Enqueued {enqueue_seeds(settings.seed_config_path)} seeds")
