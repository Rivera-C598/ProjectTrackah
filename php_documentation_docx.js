window.downloadPhpDocx = async function (group, section) {
  if (!window.docx) { alert("Document library not loaded yet. Try again in a moment."); return; }
  const D = window.docx;
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    BorderStyle, ShadingType, WidthType
  } = D;

  const ACCENT   = "e8611a";
  const MUTED    = "7A7772";
  const LIGHT_BG = "FEF3EC";
  const TODAY    = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  const groupName    = (group && group.name)         || "[Group Name]";
  const projectTitle = (group && group.projectTitle) || "[Project Title]";
  const sectionName  = (section && section.name)     || "[Section]";
  const members      = (group && group.members)      || [];

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
      ? members.map(m => [m.fullName || m, "[e.g. Backend Developer / UI Designer]", "[Describe what this member built or handled]"])
      : Array.from({ length: 5 }, (_, i) => [`[Member ${i + 1}]`, "[Role]", "[Contribution]"])
  );

  const featuresTable = makeTable(
    ["Feature", "Description"],
    [
      ["[e.g. Add Record]", "[User can fill out a form to insert a new record into the database]"],
      ["[e.g. View Records]", "[System displays all records in a list/table format]"],
      ["[e.g. Edit Record]", "[User can update existing record details through an edit form]"],
      ["[e.g. Delete Record]", "[User can remove a record with a confirmation prompt]"],
      ["[Add more features]", ""]
    ]
  );

  const tablesTable = makeTable(
    ["Table Name", "Description", "Key Fields"],
    [
      ["[e.g. products]", "[Main table — stores product records]", "[id, name, price, category_id, created_at]"],
      ["[e.g. categories]", "[Lookup table — referenced by main table via foreign key]", "[id, category_name]"],
      ["[Add more tables]", "", ""]
    ]
  );

  const linksTable = makeTable(
    ["Item", "Value"],
    [
      ["GitHub Repository", "[https://github.com/username/repo-name]"],
      ["SQL Filename", "[your_database_name.sql]"],
      ["Hosted Link", "[https://your-hosted-site.com  —  or write: Not hosted]"]
    ]
  );

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } }
      },
      children: [

        // Cover
        new Paragraph({
          children: [run("PHP + MySQL Final Project", { bold: true, size: 48, color: ACCENT })],
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
        sectionHeading("1. Group Members & Roles"),
        membersTable,

        // 2. System Description
        sectionHeading("2. System Description"),
        ph("[Write a short description of your system. What is it? What does it do overall? Keep this to 2–4 sentences.]"),
        ...blankLines(4),

        // 3. Purpose / Objectives
        sectionHeading("3. Purpose / Objectives"),
        subHeading("3.1 Purpose"),
        ph("[What problem does your system solve? Who benefits from it?]"),
        ...blankLines(3),
        subHeading("3.2 Objectives"),
        ph("[List 3–5 specific goals your system achieves. e.g. Allow users to manage records, Track inventory in real time, Provide a clean interface for data entry]"),
        ...blankLines(4),

        // 4. System Features
        sectionHeading("4. System Features"),
        featuresTable,

        // 5. Database Tables
        sectionHeading("5. Database Tables Used"),
        tablesTable,
        new Paragraph({ children: [run("")], spacing: { after: 80 } }),
        bodyText("Paste or draw your ER diagram / table relationship below (optional but recommended):"),
        ...blankLines(6),

        // 6. Screenshots
        sectionHeading("6. Screenshots"),
        bodyText("Paste screenshots of each main page below. Label each one clearly."),
        subHeading("6.1 Dashboard / Home Page"),
        ...blankLines(7),
        subHeading("6.2 List / View Page"),
        ...blankLines(7),
        subHeading("6.3 Add / Create Form"),
        ...blankLines(7),
        subHeading("6.4 Edit Form"),
        ...blankLines(7),
        subHeading("6.5 Delete Confirmation"),
        ...blankLines(5),
        subHeading("6.6 Other pages (if any)"),
        ...blankLines(5),

        // 7. How to Run Locally
        sectionHeading("7. How to Run Locally"),
        bodyText("Follow these steps to run the project on a local machine using XAMPP:"),
        new Paragraph({ children: [run("1.", { bold: true }), run("  Install XAMPP and make sure Apache and MySQL are running.")], spacing: { after: 60 } }),
        new Paragraph({ children: [run("2.", { bold: true }), run("  Clone or download the project from GitHub and place the folder inside "), run("htdocs", { bold: true }), run(".")], spacing: { after: 60 } }),
        new Paragraph({ children: [run("3.", { bold: true }), run("  Open phpMyAdmin ("), run("http://localhost/phpmyadmin", { italic: true }), run(") and create a database named "), run("[your_db_name]", { bold: true, color: ACCENT }), run(".")], spacing: { after: 60 } }),
        new Paragraph({ children: [run("4.", { bold: true }), run("  Import the SQL file: click Import → choose "), run("[your_database_name.sql]", { bold: true, color: ACCENT }), run(" → click Go.")], spacing: { after: 60 } }),
        new Paragraph({ children: [run("5.", { bold: true }), run("  Open the DB connection file ("), run("config.php", { italic: true }), run(" or similar) and verify the credentials match your XAMPP setup.")], spacing: { after: 60 } }),
        new Paragraph({ children: [run("6.", { bold: true }), run("  Open your browser and go to "), run("http://localhost/[folder-name]/", { italic: true }), run(" to run the system.")], spacing: { after: 80 } }),
        ph("[Add any additional steps specific to your project here]"),
        ...blankLines(2),

        // 8. Project Links
        sectionHeading("8. Project Links"),
        linksTable,

        new Paragraph({ children: [run("")], spacing: { after: 160 } }),
        new Paragraph({
          children: [run("Submit as PDF, DOCX, or Google Docs link.", { bold: true, italic: true, color: MUTED })],
          spacing: { after: 60 }
        })

      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${groupName.replace(/\s+/g, "_")}_PHP_Documentation.docx`;
  a.click();
  URL.revokeObjectURL(url);
};
