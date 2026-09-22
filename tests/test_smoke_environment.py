import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    'smoke_exe', Path(__file__).resolve().parents[1] / 'packaging/smoke_exe.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class WindowsEnvironmentTests(unittest.TestCase):
    def test_case_insensitive_root_and_isolated_path(self):
        for key in ('SYSTEMROOT', 'SystemRoot', 'systemroot'):
            with self.subTest(key=key):
                original = {key: 'C:/Windows', 'Path': 'external-python', 'TEMP': 'temporary'}
                result = smoke.isolated_windows_environment(original)
                self.assertEqual(result['PATH'], str(Path('C:/Windows') / 'System32'))
                self.assertNotIn('Path', result)
                self.assertEqual(result['TEMP'], 'temporary')
                self.assertEqual(original['Path'], 'external-python')

    def test_windir_fallback(self):
        result = smoke.isolated_windows_environment({'windir': 'D:/Windows'})
        self.assertEqual(result['PATH'], str(Path('D:/Windows') / 'System32'))

    def test_missing_root_is_explicit(self):
        with self.assertRaisesRegex(RuntimeError, 'SYSTEMROOT and WINDIR'):
            smoke.isolated_windows_environment({})
