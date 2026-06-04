const {
  Document, Packer, Paragraph, TextRun, HeadingLevel
} = require('docx');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(process.cwd(), 'docs', 'design', 'outputs');
const outFile = path.join(outDir, 'ac-rule-workbench-dev-spec.docx');

function p(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, font: 'Arial', size: 22 })]
  });
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: 'AC Rule Workbench Frontend Design Spec', bold: true, size: 32, font: 'Arial' })]
        }),
        p('This generated document is a historical workspace artifact for the v37 viewer design package.'),
        p('Current product authority lives in README.md, docs/formworks-editor-ac-reference-guide.md, docs/project-code-catalog.md, and docs/editor-gap-closure-plan.md.'),
        p('Primary assets:'),
        p('- ac-rule-viewer.css'),
        p('- docs/design/ac-rule-workbench-v37-preview.html'),
        p('- docs/design/ac-rule-workbench-v37.css'),
        p('Run this script with Node after installing docx: npm install docx')
      ]
    }]
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(outFile, buf);
  console.log('Wrote', outFile);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
