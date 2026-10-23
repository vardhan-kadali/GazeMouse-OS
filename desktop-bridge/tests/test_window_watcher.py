"""Unit tests for active window title watcher and allowlist enforcement."""

import unittest
from window_watcher import WindowWatcher


class MockWindowWatcher(WindowWatcher):
    """Subclass that overrides get_foreground_window_title for deterministic testing."""

    def __init__(self, allowed_keywords, excluded_keywords=None, mock_title: str = ""):
        super().__init__(allowed_keywords=allowed_keywords, excluded_keywords=excluded_keywords)
        self.mock_title = mock_title

    def get_foreground_window_title(self) -> str:
        return self.mock_title


class TestWindowWatcher(unittest.TestCase):
    """Tests window title keyword matching, exclusion list, and rejection of arbitrary windows."""

    def test_allows_approved_game_title(self):
        watcher = MockWindowWatcher(
            allowed_keywords=["Subway Surfers", "Poki"],
            mock_title="Subway Surfers - Play on Poki - Google Chrome",
        )
        self.assertTrue(watcher.is_foreground_allowed())

    def test_case_insensitive_matching(self):
        watcher = MockWindowWatcher(
            allowed_keywords=["subway surfers"],
            mock_title="SUBWAY SURFERS on Edge",
        )
        self.assertTrue(watcher.is_foreground_allowed())

    def test_rejects_unapproved_window(self):
        watcher = MockWindowWatcher(
            allowed_keywords=["Subway Surfers", "Poki"],
            mock_title="Visual Studio Code - D:\\Gaze Mouse - OS",
        )
        self.assertFalse(watcher.is_foreground_allowed())

    def test_rejects_excluded_search_window(self):
        # Window contains 'Subway Surfers' but is a Google Search tab
        watcher = MockWindowWatcher(
            allowed_keywords=["Subway Surfers", "Poki"],
            mock_title="Subway Surfers - Google Search - Google Chrome",
        )
        self.assertFalse(watcher.is_foreground_allowed())

    def test_rejects_excluded_youtube_window(self):
        # Window contains 'Subway Surfers' but is a YouTube gameplay video
        watcher = MockWindowWatcher(
            allowed_keywords=["Subway Surfers", "Poki"],
            mock_title="Subway Surfers gameplay - YouTube - Mozilla Firefox",
        )
        self.assertFalse(watcher.is_foreground_allowed())

    def test_rejects_empty_window_title(self):
        watcher = MockWindowWatcher(
            allowed_keywords=["Subway Surfers"],
            mock_title="",
        )
        self.assertFalse(watcher.is_foreground_allowed())


if __name__ == "__main__":
    unittest.main()

