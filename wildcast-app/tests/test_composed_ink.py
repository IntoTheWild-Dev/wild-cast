import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from pypdf import PdfWriter
from pypdf.generic import (ArrayObject, BooleanObject, DecodedStreamObject,
                           DictionaryObject, FloatObject, NameObject, NumberObject,
                           TextStringObject)

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('composed_ink', ROOT / 'scripts/composed-ink-report.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
ICC = ROOT / 'api/icc/ISOcoated_v2_300_eci.icc'


def control_pdf(path):
    writer = PdfWriter()
    profile = DecodedStreamObject()
    profile.set_data(ICC.read_bytes())
    profile[NameObject('/N')] = NumberObject(4)
    intent = DictionaryObject({
        NameObject('/Type'): NameObject('/OutputIntent'),
        NameObject('/S'): NameObject('/GTS_PDFX'),
        NameObject('/OutputConditionIdentifier'): TextStringObject('FOGRA39'),
        NameObject('/DestOutputProfile'): writer._add_object(profile),
    })
    writer.root_object[NameObject('/OutputIntents')] = ArrayObject([writer._add_object(intent)])
    for overprint, alpha in [(True, 1), (False, 1), (True, 0.75)]:
        page = writer.add_blank_page(width=144, height=144)
        page[NameObject('/Group')] = DictionaryObject({NameObject('/S'): NameObject('/Transparency'), NameObject('/CS'): NameObject('/DeviceCMYK')})
        gs = DictionaryObject({NameObject('/OP'): BooleanObject(overprint), NameObject('/op'): BooleanObject(overprint), NameObject('/OPM'): NumberObject(1), NameObject('/ca'): FloatObject(alpha), NameObject('/CA'): FloatObject(alpha)})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/ExtGState'): DictionaryObject({NameObject('/Ink'): gs})})
        content = DecodedStreamObject()
        content.set_data(b'0.8 0.7 0.7 0.6 k 0 0 144 144 re f q /Ink gs 0 0 0 1 k 40 40 64 64 re f Q')
        page[NameObject('/Contents')] = writer._add_object(content)
    writer.write(path)


class ComposedInkTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('gs'), 'Ghostscript required for the independent print QA job')
    def test_actual_renderer_distinguishes_overprint_knockout_and_transparency(self):
        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / 'control.pdf'
            control_pdf(pdf)
            report = qa.composed_report(pdf, ICC)
        self.assertEqual(report['status'], 'fail')
        first, knockout, transparent = report['pages']
        self.assertAlmostEqual(first['max_ink_percent'], 320, delta=0.8)
        self.assertEqual(first['status'], 'fail')
        self.assertTrue(first['over_limit_pixels'] > 0)
        self.assertTrue(all(14 <= v <= 37 for v in first['max_at_mm_from_top_left']))
        self.assertAlmostEqual(knockout['max_ink_percent'], 280, delta=0.8)
        self.assertEqual(knockout['status'], 'pass')
        self.assertAlmostEqual(transparent['max_ink_percent'], 310, delta=0.8)
        self.assertEqual(transparent['status'], 'fail')

    def test_unavailable_renderer_is_not_a_pass(self):
        with patch.object(qa.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'not performed'):
                qa.composed_report('anything.pdf', ICC)

    @unittest.skipUnless(shutil.which('gs'), 'Ghostscript required')
    def test_wrong_output_profile_cannot_silently_reconvert_the_proof(self):
        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / 'control.pdf'
            control_pdf(pdf)
            with self.assertRaisesRegex(ValueError, 'exact selected'):
                qa.composed_report(pdf, ROOT / 'api/icc/PSOcoated_v3.icc')


if __name__ == '__main__':
    unittest.main()
