window.downloadProposalDocx = async function (group, section, members) {
  if (!window.docx) { alert("Document library not loaded yet. Try again in a moment."); return; }
  const D = window.docx;
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    BorderStyle, ShadingType, WidthType, AlignmentType, HeadingLevel
  } = D;

  const ACCENT   = "1A4ED8";
  const MUTED    = "7A7772";
  const LIGHT_BG = "F0EEE9";
  const TODAY    = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const FIELDS   = group.projectFields || [];

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
    return new Paragraph({
      children: [run(text)],
      spacing: { after: 80 }
    });
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

  function tRow(cols) {
    return new TableRow({ children: cols.map(c => tCell(c)) });
  }

  function makeTable(headers, rows) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [tHeaderRow(headers), ...rows.map(tRow)]
    });
  }

  function cpBlock(label, description) {
    return [
      new Paragraph({
        children: [
          run(label, { bold: true, size: 23 }),
          run("   Status: [Pending / In Progress / Done]", { color: MUTED, italic: true })
        ],
        spacing: { before: 200, after: 80 },
        border: { left: { style: BorderStyle.SINGLE, size: 16, color: ACCENT, space: 8 } }
      }),
      new Paragraph({
        children: [run(description, { color: MUTED, italic: true })],
        spacing: { after: 60 },
        indent: { left: 200 }
      }),
      ph("[Add notes here...]"),
      ...blankLines(2)
    ];
  }

  /* ── tables ───────────────────────────────────────────────── */

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        tCell("Section", { bold: true, shade: true }),
        tCell(section.name),
        tCell("Group", { bold: true, shade: true }),
        tCell(group.name)
      ]}),
      new TableRow({ children: [
        tCell("Project Title", { bold: true, shade: true }),
        tCell(group.projectTitle),
        tCell("Date Submitted", { bold: true, shade: true }),
        tCell(TODAY)
      ]})
    ]
  });

  const membersTable = makeTable(
    ["Full Name", "Role", "Contribution / Responsibility"],
    members.length > 0
      ? members.map(m => [m.fullName, "[Type role here]", "[Describe contribution]"])
      : [["[Member 1]", "[Type role]", "[Describe contribution]"],
         ["[Member 2]", "[Type role]", "[Describe contribution]"]]
  );

  const fieldsTable = makeTable(
    ["Field Name", "Data Type", "Validation / Notes"],
    [...FIELDS.map(f => [f, "[e.g. nvarchar(100)]", "[e.g. Required, max 100 chars]"]),
     ["[Add field]", "", ""]]
  );

  const secondTableRows = Array.from({ length: 4 }, () => ["[Add field]", "", ""]);
  const secondTable = makeTable(["Field Name", "Data Type", "Validation / Notes"], secondTableRows);

  const crudTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tHeaderRow(["Operation", "Description", "Controller Action / View"]),
      new TableRow({ children: [
        tCell("Create", { bold: true }),
        tCell("[Describe what adding a record does in your system]"),
        tCell("[e.g. Create action, Create.cshtml]")
      ]}),
      new TableRow({ children: [
        tCell("Read", { bold: true }),
        tCell("[Describe what records are displayed and where]"),
        tCell("[e.g. Index action, Index.cshtml]")
      ]}),
      new TableRow({ children: [
        tCell("Update", { bold: true }),
        tCell("[Describe what can be edited and how]"),
        tCell("[e.g. Edit action, Edit.cshtml]")
      ]}),
      new TableRow({ children: [
        tCell("Delete", { bold: true }),
        tCell("[Describe what happens when a record is deleted]"),
        tCell("[e.g. Delete action, Delete.cshtml]")
      ]})
    ]
  });

  const validationTable = makeTable(
    ["Field", "Validation Rule"],
    [...FIELDS.map(f => [f, "[e.g. Required, cannot be empty]"]),
     ["[Add field]", ""]]
  );

  const pagesTable = makeTable(
    ["Page / View", "Purpose"],
    [
      ["Home / Index",              "[Describe what the home page shows]"],
      ["List View (Index.cshtml)",  "Displays all records in a searchable table"],
      ["Create View",               "Form for adding a new record to the database"],
      ["Edit View",                 "Form for modifying an existing record"],
      ["Delete View",               "Confirmation page before removing a record"],
      ["[Add page]",                ""]
    ]
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
          children: [run("ASP.NET MVC Final Project", { bold: true, size: 48, color: ACCENT })],
          spacing: { after: 80 }
        }),
        new Paragraph({
          children: [run("Proposal & Documentation", { size: 28, color: MUTED })],
          spacing: { after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 120 } }
        }),
        new Paragraph({ children: [run("")], spacing: { after: 160 } }),
        metaTable,

        // 1. Members
        sectionHeading("1. Group Members"),
        membersTable,

        // 2. Overview
        sectionHeading("2. Project Overview"),
        subHeading("2.1 Purpose of the Application"),
        ph("[Write the purpose of your system here — what does it do, what problem does it solve?]"),
        ...blankLines(4),
        subHeading("2.2 Target Users"),
        ph("[Who will use this system? e.g. school administrators, store owners, clinic staff]"),
        ...blankLines(3),

        // 3. Database
        sectionHeading("3. Database Design"),
        subHeading("3.1 Main Table — " + group.projectTitle),
        fieldsTable,
        new Paragraph({ children: [run("")], spacing: { after: 120 } }),
        subHeading("3.2 Second Table (if applicable)"),
        secondTable,

        // 4. CRUD
        sectionHeading("4. CRUD Features"),
        crudTable,

        // 5. Validation
        sectionHeading("5. Validation Rules"),
        validationTable,

        // 6. Pages
        sectionHeading("6. Planned Pages & Views"),
        pagesTable,

        // 7. Checkpoints
        sectionHeading("7. Checkpoint Progress"),
        ...cpBlock("CP 1 — Project Proposal",
          "Submit: group members, chosen title, purpose, planned fields, planned pages, member roles."),
        ...cpBlock("CP 2 — Database & Model",
          "Show: working database and tables, model class with properties, validation attributes in place."),
        ...cpBlock("CP 3 — Create & Read",
          "Show: working Create form and records displaying on the Index / List page."),
        ...cpBlock("CP 4 — Update & Delete",
          "Show: Edit form working, Delete action working with confirmation."),
        ...cpBlock("Final — Presentation & Demo",
          "Full CRUD demo, validation shown, live database records, each member explains their part."),

        // 8. Screenshots
        sectionHeading("8. Screenshots"),
        bodyText("Attach or paste screenshots of: Home page, List view, Create form, Edit form, Delete confirmation, and at least one validation error message."),
        ...blankLines(8),

        // 9. Technical Notes
        sectionHeading("9. Technical Notes & Challenges"),
        ph("[Describe any technical decisions, problems encountered, or things your group learned during development]"),
        ...blankLines(5)
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${group.name.replace(/\s+/g, "_")}_proposal_and_docs.docx`;
  a.click();
  URL.revokeObjectURL(url);
};
