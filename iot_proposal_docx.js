window.downloadIotDocx = async function (group, section) {
  if (!window.docx) { alert("Document library not loaded yet. Try again in a moment."); return; }
  const D = window.docx;
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    BorderStyle, ShadingType, WidthType, AlignmentType
  } = D;

  const ACCENT   = "10b981";  // emerald
  const MUTED    = "7A7772";
  const LIGHT_BG = "F0F9F5";
  const TODAY    = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  const groupName    = (group && group.name)         || "[Group Name]";
  const projectTitle = (group && group.projectTitle) || "[Project Title]";
  const sectionName  = (section && section.name)     || "[Section]";
  const members      = (group && group.members)      || [];

  /* ── helpers ─────────────────────────────────────────────── */

  function run(text, opts = {}) {
    return new TextRun({
      text: String(text ?? ""),
      font: "Calibri",
      size: opts.size || 22,
      bold: opts.bold || false,
      italics: opts.italic || false,
      color: opts.color || "000000"
    });
  }

  function ph(text) {
    return new Paragraph({
      children: [run(text, { color: "AAAAAA", italic: true })],
      spacing: { before: 60, after: 60 }
    });
  }

  function blankLines(n) {
    return Array.from({ length: n }, () =>
      new Paragraph({ children: [run("")], spacing: { after: 60 } })
    );
  }

  function sectionHeading(text) {
    return new Paragraph({
      children: [run(text, { bold: true, size: 26, color: ACCENT })],
      spacing: { before: 360, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 6 } }
    });
  }

  function subHeading(text) {
    return new Paragraph({
      children: [run(text, { bold: true, size: 23, color: "333333" })],
      spacing: { before: 200, after: 80 }
    });
  }

  function bodyText(text) {
    return new Paragraph({ children: [run(text)], spacing: { after: 80 } });
  }

  function tCell(text, opts = {}) {
    const isPlaceholder = typeof text === "string" && text.startsWith("[");
    return new TableCell({
      children: [new Paragraph({
        children: [run(text, {
          bold: opts.bold || false,
          italic: isPlaceholder,
          color: isPlaceholder ? "AAAAAA" : (opts.color || "000000")
        })],
        spacing: { before: 60, after: 60 }
      })],
      shading: opts.shade ? { type: ShadingType.CLEAR, color: "auto", fill: LIGHT_BG } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 120 }
    });
  }

  function tHeaderRow(cols) {
    return new TableRow({
      children: cols.map(c => tCell(c, { bold: true, shade: true })),
      tableHeader: true
    });
  }

  function makeTable(headers, rows) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tHeaderRow(headers),
        ...rows.map(r => new TableRow({ children: r.map(c => tCell(c)) }))
      ]
    });
  }

  /* ── tables ───────────────────────────────────────────────── */

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        tCell("Group Name", { bold: true, shade: true }),
        tCell(groupName),
        tCell("Section", { bold: true, shade: true }),
        tCell(sectionName)
      ]}),
      new TableRow({ children: [
        tCell("Project Title", { bold: true, shade: true }),
        tCell(projectTitle),
        tCell("Date Submitted", { bold: true, shade: true }),
        tCell(TODAY)
      ]})
    ]
  });

  const membersTable = makeTable(
    ["Full Name", "Role / Task", "Contribution"],
    members.length > 0
      ? members.map(m => [m.fullName || m, "[e.g. Programmer / Circuit Designer]", "[Describe contribution]"])
      : Array.from({ length: 5 }, (_, i) => [`[Member ${i + 1}]`, "[Role]", "[Contribution]"])
  );

  const componentsTable = makeTable(
    ["Component", "Quantity", "Purpose in the System"],
    [
      ["Arduino Uno", "1", "Main microcontroller — runs the code and controls all components"],
      ["[Sensor / Component 2]", "[1]", "[Describe purpose]"],
      ["[Sensor / Component 3]", "[1]", "[Describe purpose]"],
      ["[Add more rows as needed]", "", ""]
    ]
  );

  const logicTable = makeTable(
    ["Input / Trigger", "Arduino Decision", "Output / Action"],
    [
      ["[e.g. Sensor reads high value]", "[if condition in code]", "[e.g. LED turns on / buzzer sounds]"],
      ["[Input 2]", "[Decision 2]", "[Output 2]"],
      ["[Input 3]", "[Decision 3]", "[Output 3]"]
    ]
  );

  const contributionsTable = makeTable(
    ["Full Name", "Assigned Role", "Specific Contribution"],
    members.length > 0
      ? members.map(m => [m.fullName || m, "[Role]", "[What exactly did this member do?]"])
      : Array.from({ length: 5 }, (_, i) => [`[Member ${i + 1}]`, "[Role]", "[Contribution]"])
  );

  /* ── document ─────────────────────────────────────────────── */

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } }
      },
      children: [

        // Cover
        new Paragraph({
          children: [run("Arduino IoT Final Project", { bold: true, size: 48, color: ACCENT })],
          spacing: { after: 80 }
        }),
        new Paragraph({
          children: [run("Project Documentation", { size: 28, color: MUTED })],
          spacing: { after: 80 }
        }),
        new Paragraph({
          children: [run(`"${projectTitle}"`, { size: 28, bold: true })],
          spacing: { after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 120 } }
        }),
        new Paragraph({ children: [run("")], spacing: { after: 160 } }),
        metaTable,

        // 1. Group Members
        sectionHeading("1. Group Members"),
        membersTable,

        // 2. Project Overview
        sectionHeading("2. Project Overview"),
        subHeading("2.1 Project Description"),
        ph("[Provide a short description of your system. What does it do overall?]"),
        ...blankLines(3),
        subHeading("2.2 Purpose of the System"),
        ph("[What is the system designed to do? What problem does it solve?]"),
        ...blankLines(3),
        subHeading("2.3 Real-World Application"),
        ph("[Where can this system be used in real life? Give a specific scenario.]"),
        ...blankLines(3),

        // 3. Components
        sectionHeading("3. Components Used"),
        componentsTable,



        // 4. Circuit Description
        sectionHeading("4. Circuit Description"),
        subHeading("4.1 Wiring Overview"),
        ph("[Describe how the components are connected to the Arduino. Which pin does each component use?]"),
        ...blankLines(4),
        subHeading("4.2 Circuit Diagram / Screenshot"),
        bodyText("Paste a screenshot of your completed Tinkercad circuit below:"),
        ...blankLines(8),

        // 8. Bonus Component (if any)
        sectionHeading("5. Bonus Component (if applicable)"),
        subHeading("5.1 Component Name"),
        ph("[Name of the bonus component not covered in class]"),
        subHeading("5.2 How It Works"),
        ph("[Explain how this component works and how you integrated it into your system.]"),
        ...blankLines(3),

        // 10. Member Contributions
        sectionHeading("6. Member Contributions"),
        contributionsTable,

        new Paragraph({ children: [run("")], spacing: { after: 160 } }),
        new Paragraph({
          children: [run("Tinkercad Circuit Name Format: ", { bold: true }), run(`Group [Number] - Final Project - ${projectTitle}`)],
          spacing: { after: 60 }
        }),

      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = groupName.replace(/\s+/g, "_");
  a.download = `${safeName}_IoT_Documentation.docx`;
  a.click();
  URL.revokeObjectURL(url);
};
