"""Test the deterministic JD parser against real DotStark JD text."""
import json
import sys
sys.path.insert(0, ".")

from app.services.jd_parser import parse_jd

# Real samples from the DotStark JD corpus (Job Description's Folder 26.pdf)
SAMPLES = [
    # 1. Sales Executive (markdown headers, bullets, qualifications)
    """## Job Description: Sales Executive-Business Growth (Expert Level)
Position Overview We are seeking a proven Sales Executive-Business Growth at the expert level to drive enterprise-level revenue expansion for our technology services division. This senior sales leadership role demands a hunter mentality, sophisticated deal-making expertise, and the ability to close complex, high-value contracts.
## Key Responsibilities
- Generate qualified pipeline quarterly through multi-channel prospecting (LinkedIn Sales Navigator, ABM campaigns, industry events, CXO networking)
- Achieve conversion rates from lead to opportunity through rigorous qualification (MEDDPICC methodology)
- Navigate 6-9 month enterprise sales cycles involving multiple decision-makers
- Lead cross-functional deal teams (Solutions Architect, Delivery Head, Customer Success) for flawless execution
Qualifications
- 8+ years in enterprise technology sales with annual quota consistently exceeded
- B.Tech/MBA from Tier-1 institute preferred; equivalent enterprise sales experience mandatory
- Proven track record closing deals annually
- Technical aptitude to credibly discuss architecture (Microservices, Flutter cross-platform, Cloud Native)
- CRM certification (Salesforce Administrator preferred)
Location: Jaipur, India (Rajasthan) | PAN India client travel required""",

    # 2. Java Developer (dash separator, bold metadata, mangled table)
    """## Job Description – Java Developer
**Location:** Jaipur **Experience:** Relevant experience as per role requirements **CTC Range:** ₹4–8 LPA **Openings:** 1
## Role Overview
We are looking for a skilled **Java Developer** to contribute across all phases of the software development lifecycle. The ideal candidate will be responsible for designing, developing, testing, and maintaining high-performance, scalable Java-based applications aligned with business objectives.
## Key Responsibilities
- Contribute to all stages of the **Software Development Life Cycle (SDLC)**, from requirement analysis to deployment
- Design, develop, and maintain **high-volume, low-latency Java and Java EE applications**
- Analyze user requirements and translate them into **technical specifications and system designs**
- Develop, test, debug, and deploy well-designed, reusable, and maintainable Java code
- Conduct software analysis, programming, unit testing, and troubleshooting
### Required Skills & Qualifications
- Strong proficiency in Java, with a solid understanding of its ecosystem
- In-depth knowledge of Object-Oriented Programming (OOP) concepts and design patterns
- Experience with Java web frameworks and development of reusable Java libraries
- Understanding of Java concurrency patterns and multithreading concepts
- Basic to intermediate knowledge of MVC architecture, JDBC, and RESTful web services""",

    # 3. QA Engineer (metadata line, Role Overview, Preferred section)
    """## Job Description – Quality Assurance (QA) Engineer
**Location:** Jaipur **Employment Type:** Full-Time **Work Schedule:** 5 Days Working **Openings:** 2 **Experience Required:** 1–3+ Years **CTC:** As per company standards
## Role Overview
We are seeking a detail-oriented and proactive **QA Engineer** to ensure the quality, performance, and reliability of our products.
## Key Responsibilities
- Gain a thorough understanding of project requirements and change requests through documentation
- Execute various QA activities including functional testing, regression testing, UI testing, ad-hoc testing
- Design, implement, and maintain end-to-end test strategies covering functionality, performance, scalability, and security
- Log, track, and manage defects using standard defect tracking tools
- Collaborate with developers to understand new features, troubleshoot critical issues, and validate fixes
## Required Qualifications & Skills
- Bachelor's degree in Computer Science, Computer Engineering, or a related technical discipline
- Minimum 1–3 years of experience in software testing or development
- Strong passion for quality with a mindset to identify defects beyond standard test cases
- Experience with industry-standard test management and automation tools/frameworks
- Solid understanding of black-box and white-box testing, performance testing, and requirements traceability""",

    # 4. Messy WhatsApp-style forward (no headers, low structure)
    """Hi all, we are hiring!! Looking for a React developer with 3+ years experience for our Jaipur office. Should know TypeScript, Redux, REST APIs. Good communication skills needed. Immediate joiners preferred. Share resume at hr@dotstark.com""",
]

for i, text in enumerate(SAMPLES, 1):
    structured, confidence = parse_jd(text)
    print(f"\n{'='*70}\nSAMPLE {i}  (confidence: {confidence})")
    print(f"  title:           {structured['title']!r}")
    print(f"  summary:         {structured['summary'][:90]!r}...")
    print(f"  responsibilities: {len(structured['responsibilities'])} items")
    for r in structured["responsibilities"][:3]:
        print(f"    - {r[:80]}")
    print(f"  requirements:    {len(structured['requirements'])} items")
    for r in structured["requirements"][:3]:
        print(f"    - {r[:80]}")
    print(f"  nice_to_have:    {len(structured['nice_to_have'])} items")
    print(f"  metadata:        {structured['metadata']}")
    print(f"  exp_mentions:    {structured['experience_mentions'][:2]}")
