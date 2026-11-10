"""Single entry point for the backend: `get_river_ai(use_mock)`.

Construction never raises (the backend builds it outside its error handling); failures surface per call."""
from rivermind_ai.interface import RiverAI


def get_river_ai(use_mock: bool) -> RiverAI:
    if use_mock:
        from rivermind_ai.mock import MockRiverAI

        return MockRiverAI()
    from rivermind_ai.real import RealRiverAI  # imported lazily: the mock must work with base deps only

    return RealRiverAI()
