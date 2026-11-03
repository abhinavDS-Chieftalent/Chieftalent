"""Generate dummy Business Analyst CV PDFs into jobs/business_analyst/.

Creates three test candidates:
  1. Aarav Mehta  - strong, demonstrated BA background (should pass ATS)
  2. Riya Kapoor  - unrelated background (should be rejected)
  3. Vikram Shah  - adjacent/data background, partial match (borderline)
"""

from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "jobs" / "business_analyst"

CVS = {
    "candidate_01_cv.pdf": [
        ("Aarav Mehta", 18),
        ("Business Analyst", 13),
        ("Email: aarav.mehta@example.com | Phone: +91 98200 12345 | Pune, India", 10),
        ("", 10),
        ("PROFESSIONAL SUMMARY", 12),
        ("Business Analyst with 5+ years of experience eliciting, analysing and documenting "
         "business and functional requirements for financial-services and retail clients. "
         "Skilled at bridging stakeholders and development teams in Agile/Scrum environments.", 10),
        ("", 10),
        ("WORK EXPERIENCE", 12),
        ("Senior Business Analyst - FinEdge Solutions (2021 - Present)", 11),
        ("- Led requirement gathering workshops with business stakeholders for a loan-origination platform.", 10),
        ("- Documented business requirements, functional specifications, user stories and acceptance criteria in Jira/Confluence.", 10),
        ("- Analysed and re-modelled the customer onboarding process, cutting processing time by 30%.", 10),
        ("- Wrote SQL queries and Excel reports to validate data and support business decisions.", 10),
        ("- Facilitated sprint planning, backlog refinement and UAT sessions in a Scrum team.", 10),
        ("Business Analyst - RetailSys Pvt Ltd (2019 - 2021)", 11),
        ("- Gathered requirements for an inventory-management system through stakeholder interviews.", 10),
        ("- Produced BRDs, process maps (BPMN) and reporting dashboards for management.", 10),
        ("", 10),
        ("SKILLS", 12),
        ("Requirement gathering, stakeholder management, business process analysis, user stories, "
         "acceptance criteria, Agile/Scrum, SQL, Excel, Power BI, Jira, Confluence, documentation.", 10),
        ("", 10),
        ("EDUCATION", 12),
        ("B.Tech, Information Technology - Pune University (2019)", 10),
    ],
    "candidate_02_cv.pdf": [
        ("Riya Kapoor", 18),
        ("Graphic Designer", 13),
        ("Email: riya.kapoor@example.com | Phone: +91 98110 54321 | Mumbai, India", 10),
        ("", 10),
        ("PROFILE", 12),
        ("Creative graphic designer with 4 years of experience producing brand identities, "
         "marketing collateral and social-media creatives for agencies and startups.", 10),
        ("", 10),
        ("WORK EXPERIENCE", 12),
        ("Graphic Designer - PixelWorks Studio (2021 - Present)", 11),
        ("- Designed logos, brochures and campaign assets for 20+ clients.", 10),
        ("- Managed print production and vendor coordination.", 10),
        ("Junior Designer - BrightAds (2019 - 2021)", 11),
        ("- Created social-media creatives and presentation decks.", 10),
        ("", 10),
        ("SKILLS", 12),
        ("Adobe Photoshop, Illustrator, InDesign, Figma, brand design, typography.", 10),
        ("", 10),
        ("EDUCATION", 12),
        ("Bachelor of Fine Arts - Mumbai University (2019)", 10),
    ],
    "candidate_03_cv.pdf": [
        ("Vikram Shah", 18),
        ("Data Analyst", 13),
        ("Email: vikram.shah@example.com | Phone: +91 98980 99887 | Ahmedabad, India", 10),
        ("", 10),
        ("SUMMARY", 12),
        ("Data analyst with 3 years of experience turning operational data into reports and "
         "dashboards for business teams. Comfortable writing complex SQL and working directly "
         "with stakeholders to understand reporting needs.", 10),
        ("", 10),
        ("WORK EXPERIENCE", 12),
        ("Data Analyst - LogiTrack Services (2022 - Present)", 11),
        ("- Built SQL pipelines and Excel/Power BI reports for operations KPIs.", 10),
        ("- Worked with operations managers to gather reporting requirements and document metric definitions.", 10),
        ("- Identified a bottleneck in the dispatch process from data analysis; recommended changes adopted by management.", 10),
        ("Junior Analyst - MarketWise (2020 - 2022)", 11),
        ("- Produced weekly sales reports; automated recurring Excel reporting.", 10),
        ("", 10),
        ("SKILLS", 12),
        ("SQL, Excel, Power BI, Python (pandas), reporting, data analysis, stakeholder communication.", 10),
        ("", 10),
        ("EDUCATION", 12),
        ("B.Sc, Statistics - Gujarat University (2020)", 10),
    ],
}


def render_pdf(path, lines):
    c = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4
    y = height - 2 * cm
    for text, size in lines:
        if y < 2 * cm:
            c.showPage()
            y = height - 2 * cm
        c.setFont("Helvetica-Bold" if size >= 12 else "Helvetica", size)
        # naive wrap for long lines
        max_chars = max(40, int(95 * (10 / max(size, 1))))
        words = text.split()
        line = ""
        for w in words:
            if len(line) + len(w) + 1 > max_chars:
                c.drawString(2 * cm, y, line)
                y -= size + 6
                line = w
            else:
                line = f"{line} {w}".strip()
        c.drawString(2 * cm, y, line)
        y -= size + 10
    c.save()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, lines in CVS.items():
        path = OUT / name
        render_pdf(path, lines)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
