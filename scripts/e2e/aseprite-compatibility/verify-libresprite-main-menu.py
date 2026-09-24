#!/usr/bin/env python3
"""Validate the product-owned menu catalog with Python's standard library."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def walk(nodes):
    for node in nodes:
        yield node
        yield from walk(node.get('children', []))


class ProductMenuTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT / 'apps/editor/assets/commands/libresprite-main-menu.json').read_text())
        cls.nodes = list(walk(cls.catalog['menus']))

    def test_product_groups_and_mnemonics(self):
        self.assertEqual(self.catalog['schemaVersion'], 3)
        self.assertEqual([node['label'] for node in self.catalog['menus']],
                         ['File', 'Edit', 'Sprite', 'Layer', 'Frame', 'Select', 'View'])
        self.assertEqual(self.catalog['menus'][4]['mnemonicIndex'], 1)
        self.assertEqual(self.catalog['menus'][5]['mnemonicIndex'], 5)

    def test_data_has_no_upstream_extraction_metadata(self):
        self.assertNotIn('provenance', self.catalog)
        self.assertNotIn('warnings', self.catalog)
        for node in self.nodes:
            for field in ('sourcePath', 'rawLabel', 'translationKey', 'labelSource',
                          'sourceKind', 'shortcutsByContext', 'destination', 'requiresFeatures'):
                self.assertNotIn(field, node)

    def test_file_order_recent_slot_and_export_actions(self):
        file = self.catalog['menus'][0]['children']
        self.assertEqual([node.get('label', node['kind']) for node in file],
                         ['New...', 'Open...', 'Open Recent', 'separator', 'Save', 'Save As...',
                          'Export As...', 'Close', 'Close All', 'separator', 'Import Sprite Sheet',
                          'Export Sprite Sheet', 'Export Tileset', 'Repeat Last Export',
                          'separator', 'Exit'])
        recent = file[2]['children']
        self.assertEqual(recent[1], {'kind': 'placeholder', 'marker': 'recent-files'})
        export_as = next(node for node in file if node.get('command') == 'SaveFileCopyAs')
        self.assertEqual(export_as['shortcut'], 'Ctrl+Alt+Shift+S')
        self.assertEqual(next(node for node in file if node.get('command') == 'ExportSpriteSheet')['shortcut'], 'Ctrl+E')

    def test_product_commands_and_shortcuts_survive(self):
        flip = [node for node in self.nodes if node.get('command') == 'Flip'
                and node.get('params', {}).get('target') == 'mask']
        self.assertEqual({node['params']['orientation']: node.get('shortcut') for node in flip},
                         {'horizontal': 'Shift+H', 'vertical': 'Shift+V'})
        clipboard = next(node for node in self.nodes if node.get('command') == 'NewFile'
                         and node.get('params', {}).get('fromClipboard') == 'true')
        self.assertNotIn('shortcut', clipboard)
        self.assertEqual(next(node for node in self.nodes if node.get('command') == 'SetLoopSection')['label'],
                         'Set Loop Section')
        speeds = [node['label'] for node in self.nodes if node.get('command') == 'SetPlaybackSpeed']
        self.assertEqual(speeds, ['Playback Speed 0.25x', 'Playback Speed 0.5x',
                                  'Playback Speed 1x', 'Playback Speed 1.5x',
                                  'Playback Speed 2x', 'Playback Speed 3x'])

    def test_disabled_legacy_and_vendor_only_nodes_are_removed(self):
        commands = {node.get('command') for node in self.nodes}
        self.assertTrue({'File', 'View'} <= {node['label'] for node in self.catalog['menus']})
        self.assertNotIn('Help', {node['label'] for node in self.catalog['menus']})
        self.assertNotIn('OpenScriptFolder', commands)
        self.assertNotIn('Debugger', commands)
        self.assertNotIn('About', commands)
        self.assertNotIn('Launch', commands)
        self.assertNotIn('ColorCurve', commands)
        self.assertNotIn('ConvolutionMatrix', commands)
        self.assertNotIn('Despeckle', commands)
        self.assertNotIn('LoadMask', commands)
        self.assertNotIn('SaveMask', commands)
        # This row is in the shared GPL menu shape; retain its unavailable product state.
        self.assertIn('NewBrush', commands)


if __name__ == '__main__':
    unittest.main()
