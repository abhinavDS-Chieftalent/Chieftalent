"""Deterministic resume parser: structured extraction, no AI.

Extracts the facts an ATS needs from resume text using rules, taxonomies and
date math (the classic pre-LLM resume-parsing approach):

  - contact info (email, phone, LinkedIn, GitHub)
  - skills (matched against a technology/skill taxonomy)
  - total experience in years (computed from date ranges, not guessed)
  - education (degree + institution lines)
  - job titles held (from common title keywords)

The LLM reviewer receives these structured facts alongside the raw text, so
it spends its judgement on relevance instead of basic fact extraction.
"""

import re
from datetime import date

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(\+?\d[\d\s().-]{7,}\d)")
LINKEDIN_RE = re.compile(r"(?:linkedin\.com/in/|linkedin\.com/pub/)([A-Za-z0-9_-]+)", re.IGNORECASE)
GITHUB_RE = re.compile(r"github\.com/([A-Za-z0-9_-]+)", re.IGNORECASE)
URL_RE = re.compile(r"https?://[^\s)>\]]+")

# Technology/skill taxonomy. Keys are canonical names; values are aliases that
# map to the canonical name. Matched case-insensitively on word boundaries.
SKILL_TAXONOMY = {
    # Languages
    "Python": ["python"],
    "Java": ["java"],
    "JavaScript": ["javascript", "js"],
    "TypeScript": ["typescript", "ts"],
    "C#": ["c#", "csharp", "c sharp"],
    "C++": ["c++", "cpp"],
    "PHP": ["php"],
    "Go": ["golang"],
    "Ruby": ["ruby", "ruby on rails"],
    "Swift": ["swift"],
    "Kotlin": ["kotlin"],
    "SQL": ["sql"],
    "R": ["r programming", "r language"],
    # Frontend
    "React": ["react", "react.js", "reactjs"],
    "Angular": ["angular", "angular.js", "angularjs"],
    "Vue.js": ["vue", "vue.js", "vuejs"],
    "Next.js": ["next.js", "nextjs"],
    "HTML/CSS": ["html", "css", "html5", "css3", "scss", "sass", "less"],
    "Tailwind CSS": ["tailwind", "tailwind css", "tailwindcss"],
    "Flutter": ["flutter"],
    "React Native": ["react native"],
    # Backend / frameworks
    ".NET": [".net", "dotnet", "asp.net", "asp.net core", ".net core"],
    "Node.js": ["node", "node.js", "nodejs"],
    "Django": ["django"],
    "Flask": ["flask"],
    "Laravel": ["laravel"],
    "Spring Boot": ["spring", "spring boot", "springboot"],
    "Express.js": ["express", "express.js", "expressjs"],
    "FastAPI": ["fastapi"],
    # Data / cloud / devops
    "AWS": ["aws", "amazon web services"],
    "Azure": ["azure", "microsoft azure"],
    "GCP": ["gcp", "google cloud"],
    "Docker": ["docker"],
    "Kubernetes": ["kubernetes", "k8s"],
    "Terraform": ["terraform"],
    "CI/CD": ["ci/cd", "cicd", "jenkins", "github actions", "azure devops", "gitlab ci"],
    "PostgreSQL": ["postgresql", "postgres"],
    "MySQL": ["mysql"],
    "SQL Server": ["sql server", "mssql", "ms sql"],
    "MongoDB": ["mongodb", "mongo"],
    "Redis": ["redis"],
    "Elasticsearch": ["elasticsearch", "elastic search"],
    "GraphQL": ["graphql"],
    "REST APIs": ["rest api", "restful", "rest apis"],
    "Microservices": ["microservices", "micro-services"],
    # Data / AI
    "Machine Learning": ["machine learning", "ml"],
    "Deep Learning": ["deep learning"],
    "NLP": ["nlp", "natural language processing"],
    "LLMs": ["llm", "llms", "large language models", "gpt", "openai", "langchain"],
    "Power BI": ["power bi", "powerbi"],
    "Tableau": ["tableau"],
    "Excel": ["excel", "advanced excel", "vlookup", "pivot tables"],
    "Pandas": ["pandas"],
    "NumPy": ["numpy"],
    # Business / other
    "Agile/Scrum": ["agile", "scrum", "kanban", "safe"],
    "Jira": ["jira"],
    "Salesforce": ["salesforce"],
    "SEO": ["seo", "search engine optimization"],
    "Digital Marketing": ["digital marketing", "social media marketing", "google ads"],
    "Content Writing": ["content writing", "copywriting", "technical writing"],
    "Manual Testing": ["manual testing", "functional testing", "regression testing"],
    "Test Automation": ["selenium", "cypress", "playwright", "test automation", "automation testing"],
    "Sitecore": ["sitecore"],
    "Kentico": ["kentico"],
    "RPA": ["rpa", "uipath", "automation anywhere", "blue prism"],
    "SAP": ["sap"],
    "Dynamics 365": ["dynamics 365", "dynamics crm", "microsoft dynamics"],
}

# Job-title vocabulary for role detection.
TITLE_KEYWORDS = [
    "software engineer", "software developer", "senior software engineer",
    "full stack developer", "full-stack developer", "frontend developer",
    "front-end developer", "backend developer", "back-end developer",
    "web developer", "mobile developer", "android developer", "ios developer",
    "devops engineer", "cloud engineer", "data analyst", "data scientist",
    "data engineer", "business analyst", "product manager", "project manager",
    "qa engineer", "quality assurance", "test engineer", "sdet",
    "ui/ux designer", "ui designer", "ux designer", "graphic designer",
    "sales executive", "sales manager", "business development",
    "account manager", "marketing executive", "digital marketing",
    "content writer", "technical writer", "hr executive", "hr manager",
    "talent acquisition", "recruiter", "accountant", "finance analyst",
    "operations manager", "team lead", "tech lead", "technical lead",
    "solution architect", "solutions architect", "architect", "cto",
    "intern", "trainee", "associate", "consultant", "analyst",
]

DEGREE_KEYWORDS = [
    "ph.d", "phd", "doctorate",
    "m.tech", "mtech", "m.e.", "masters", "master of", "mba", "m.sc", "msc", "mca",
    "b.tech", "btech", "b.e.", "bachelor", "b.sc", "bsc", "bca", "bba", "b.com",
    "diploma",
]

# Date ranges like "Jan 2020 - Mar 2023", "2020-2023", "2019 - Present".
MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec"
DATE_RANGE_RE = re.compile(
    rf"(?:(?:{MONTHS})[a-z]*\.?\s+)?(\d{{4}})\s*[-–—to]+\s*"
    rf"(?:(?:{MONTHS})[a-z]*\.?\s+)?(\d{{4}}|present|current|till date|now)",
    re.IGNORECASE,
)


def extract_contact(text):
    email_m = EMAIL_RE.search(text or "")
    phone_m = PHONE_RE.search(text or "")
    linkedin_m = LINKEDIN_RE.search(text or "")
    github_m = GITHUB_RE.search(text or "")
    return {
        "email": email_m.group(0) if email_m else "",
        "phone": phone_m.group(1).strip() if phone_m else "",
        "linkedin": linkedin_m.group(0) if linkedin_m else "",
        "github": github_m.group(0) if github_m else "",
    }


def extract_skills(text):
    """Match the taxonomy against the text. Returns sorted canonical skills."""
    low = f" {re.sub(r'[^a-z0-9+#./ ]', ' ', (text or '').lower())} "
    found = set()
    for canonical, aliases in SKILL_TAXONOMY.items():
        for alias in aliases:
            # Word-boundary match that tolerates punctuation edges (c++, .net).
            pattern = rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])"
            if re.search(pattern, low):
                found.add(canonical)
                break
    return sorted(found)


def extract_experience_years(text):
    """Sum non-overlapping date ranges from work-history lines only.

    Lines that look like education (degree/university keywords) are excluded
    so '2014-2018 B.Tech' doesn't inflate the years count.
    """
    today = date.today()
    work_lines = []
    for line in (text or "").splitlines():
        low = line.lower()
        if any(re.search(rf"(?<![a-z0-9.]){re.escape(k)}(?![a-z0-9])", low) for k in DEGREE_KEYWORDS) \
                or "university" in low or "college" in low or "school" in low:
            continue
        work_lines.append(line)
    work_text = "\n".join(work_lines)

    intervals = []
    for m in DATE_RANGE_RE.finditer(work_text):
        start = int(m.group(1))
        end_raw = m.group(2).lower()
        end = today.year if end_raw in ("present", "current", "till date", "now") else int(end_raw)
        if 1970 <= start <= today.year and start <= end <= today.year + 1:
            intervals.append((start, min(end, today.year)))
    if not intervals:
        return 0.0, 0
    # Merge overlapping intervals so overlapping jobs don't double-count.
    intervals.sort()
    merged = [list(intervals[0])]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    years = sum(end - start for start, end in merged)
    return round(float(years), 1), len(intervals)


def extract_education(text):
    """Degree-bearing lines (word-boundary matched so 'github.com' doesn't
    count as a 'b.com')."""
    out = []
    for line in (text or "").splitlines():
        s = line.strip()
        if not s or len(s) > 160:
            continue
        low = s.lower()
        degree_hit = any(
            re.search(rf"(?<![a-z0-9.]){re.escape(k)}(?![a-z0-9])", low)
            for k in DEGREE_KEYWORDS
        )
        if degree_hit or (
            ("university" in low or "college" in low or "institute" in low)
            and not EMAIL_RE.search(low)
        ):
            if s not in out:
                out.append(s)
        if len(out) >= 4:
            break
    return out


def extract_titles(text):
    """Job titles mentioned in the resume (most specific first)."""
    low = (text or "").lower()
    found = []
    for title in sorted(TITLE_KEYWORDS, key=len, reverse=True):
        if re.search(rf"(?<![a-z]){re.escape(title)}(?![a-z])", low):
            canonical = title.title()
            if canonical not in found:
                found.append(canonical)
    return found[:8]


def parse_resume(text):
    """Full deterministic parse. Returns a dict of structured facts."""
    text = text or ""
    years, ranges = extract_experience_years(text)
    return {
        "contact": extract_contact(text),
        "skills": extract_skills(text),
        "experience_years": years,
        "experience_ranges_found": ranges,
        "education": extract_education(text),
        "titles": extract_titles(text),
    }


def format_profile_for_prompt(profile):
    """Render the structured facts compactly for the ATS prompt."""
    c = profile["contact"]
    lines = [
        f"Parsed experience (from date ranges): {profile['experience_years']} years",
        f"Parsed skills: {', '.join(profile['skills']) or '(none detected)'}",
        f"Titles mentioned: {', '.join(profile['titles']) or '(none detected)'}",
        f"Education: {'; '.join(profile['education'][:2]) or '(none detected)'}",
        f"Email: {c['email'] or '(none)'} | Phone: {c['phone'] or '(none)'}",
    ]
    return "\n".join(lines)
