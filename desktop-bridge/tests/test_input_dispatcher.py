"""Unit tests for input dispatcher in mock mode (strictly zero real keyboard input)."""

import asyncio
import unittest
from input_dispatcher import InputDispatcher, KEY_DEFINITIONS


class TestInputDispatcher(unittest.IsolatedAsyncioTestCase):
    """Tests input dispatcher lifecycle, discrete pulse mechanics, and key-release safety."""

    def setUp(self):
        # Explicit mock_mode=True ensures tests NEVER generate real OS keystrokes
        self.dispatcher = InputDispatcher(mock_mode=True, pulse_duration_ms=5)

    def test_key_definitions_complete(self):
        for expected in ("LEFT", "RIGHT", "JUMP", "SLIDE"):
            self.assertIn(expected, KEY_DEFINITIONS)
            self.assertIn("scan", KEY_DEFINITIONS[expected])
            self.assertIn("vk", KEY_DEFINITIONS[expected])

    def test_dispatch_action_discrete_lifecycle(self):
        # Dispatching LEFT must record DOWN then UP
        result = self.dispatcher.dispatch_action("LEFT")
        self.assertTrue(result)

        history = self.dispatcher.dispatched_events_history
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0][0], "LEFT")
        self.assertEqual(history[0][1], "DOWN")
        self.assertEqual(history[1][0], "LEFT")
        self.assertEqual(history[1][1], "UP")

        # After dispatch, no keys should remain held
        self.assertFalse(self.dispatcher.has_held_keys)

    def test_rejects_unknown_action(self):
        result = self.dispatcher.dispatch_action("FIRE_MISSILE")
        self.assertFalse(result)
        self.assertEqual(len(self.dispatcher.dispatched_events_history), 0)

    def test_release_all_held_keys_cleans_up(self):
        # Simulate an interrupted action where a key remained in _held_actions
        self.dispatcher._held_actions.add("RIGHT")
        self.dispatcher._held_actions.add("JUMP")
        self.assertTrue(self.dispatcher.has_held_keys)

        released = self.dispatcher.release_all_held_keys()
        self.assertEqual(released, 2)
        self.assertFalse(self.dispatcher.has_held_keys)

        # Check emergency up events were recorded
        emergency_events = [ev for ev in self.dispatcher.dispatched_events_history if ev[1] == "EMERGENCY_UP"]
        self.assertEqual(len(emergency_events), 2)

    async def test_dispatch_action_async_discrete_lifecycle(self):
        result = await self.dispatcher.dispatch_action_async("RIGHT")
        self.assertTrue(result)

        history = self.dispatcher.dispatched_events_history
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0][0], "RIGHT")
        self.assertEqual(history[0][1], "DOWN")
        self.assertEqual(history[1][0], "RIGHT")
        self.assertEqual(history[1][1], "UP")
        self.assertFalse(self.dispatcher.has_held_keys)

    async def test_dispatch_action_async_cancellation_guarantees_key_up(self):
        # Dispatch with a longer pulse duration so we can cancel mid-pulse
        long_dispatcher = InputDispatcher(mock_mode=True, pulse_duration_ms=500)

        task = asyncio.create_task(long_dispatcher.dispatch_action_async("JUMP"))
        # Allow task to enter KeyDown and sleep
        await asyncio.sleep(0.02)
        self.assertTrue(long_dispatcher.has_held_keys)

        # Cancel mid-pulse
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

        # Key-up must have executed in finally block despite cancellation
        self.assertFalse(long_dispatcher.has_held_keys)
        up_events = [ev for ev in long_dispatcher.dispatched_events_history if ev[0] == "JUMP" and ev[1] == "UP"]
        self.assertEqual(len(up_events), 1)


if __name__ == "__main__":
    unittest.main()
