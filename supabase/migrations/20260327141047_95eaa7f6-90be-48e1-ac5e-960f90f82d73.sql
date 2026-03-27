INSERT INTO rams_activity_library (
  activity_key,
  activity_name,
  category,
  british_standard,
  description,
  hazards,
  method_statements,
  ppe_requirements,
  emergency_procedures,
  default_site_hazards,
  sort_order,
  is_active
) VALUES (
  'young_persons_assessment',
  'Young Persons Risk Assessment (Under 18 Apprentice)',
  'Special Assessments',
  'Management of Health and Safety at Work Regulations 1999 (Reg 19)',
  'Special risk assessment for young persons (under 18) working as apprentices in fire alarm and security installation/maintenance. Required under Regulation 19 of the Management of Health and Safety at Work Regulations 1999. Covers inexperience, lack of awareness, physical and psychological maturity considerations.',
  '[
    {
      "id": "yp1",
      "hazard": "Inexperience and Lack of Awareness",
      "who_affected": "Young Person (Apprentice)",
      "existing_controls": "Supervised at all times by competent adult engineer. Not permitted to work alone. Structured training programme in place. Regular competency assessments conducted.",
      "additional_controls": "Apprentice must shadow qualified engineer for minimum 3 months before undertaking any tasks independently. Daily toolbox talks covering job-specific hazards. Written confirmation of understanding required.",
      "severity": 4,
      "likelihood": 3,
      "risk_level": "High",
      "residual_severity": 4,
      "residual_likelihood": 1,
      "residual_risk": "Low"
    },
    {
      "id": "yp2",
      "hazard": "Working at Height",
      "who_affected": "Young Person (Apprentice)",
      "existing_controls": "Young person must not work at height above 2m without direct supervision. Only permitted to use step ladders (not extension ladders) after formal training. Tower scaffolds to be erected by competent adult only.",
      "additional_controls": "Height restrictions enforced: maximum step ladder height 1.8m. Young person must demonstrate competency before any height work. Fall arrest equipment fitted and training provided where required.",
      "severity": 5,
      "likelihood": 3,
      "risk_level": "High",
      "residual_severity": 5,
      "residual_likelihood": 1,
      "residual_risk": "Medium"
    },
    {
      "id": "yp3",
      "hazard": "Electrical Hazards",
      "who_affected": "Young Person (Apprentice)",
      "existing_controls": "Young person must not work on any electrical circuits unsupervised. Low voltage (24V DC) work only after formal ECS/training. No mains voltage work permitted. Isolation procedures demonstrated and understood.",
      "additional_controls": "Apprentice must hold or be working towards relevant electrical qualifications. Competent person to verify all isolations. Insulated tools provided and use enforced.",
      "severity": 5,
      "likelihood": 3,
      "risk_level": "High",
      "residual_severity": 5,
      "residual_likelihood": 1,
      "residual_risk": "Medium"
    },
    {
      "id": "yp4",
      "hazard": "Manual Handling",
      "who_affected": "Young Person (Apprentice)",
      "existing_controls": "Physical capability assessment completed. Reduced maximum lifting weight (15kg for young persons). Manual handling training provided. Two-person lift policy for items over 10kg.",
      "additional_controls": "Regular monitoring of physical demands. Mechanical aids provided where possible. Young person encouraged to request help without hesitation.",
      "severity": 3,
      "likelihood": 3,
      "risk_level": "Medium",
      "residual_severity": 3,
      "residual_likelihood": 1,
      "residual_risk": "Low"
    },
    {
      "id": "yp5",
      "hazard": "Use of Power Tools and Equipment",
      "who_affected": "Young Person (Apprentice)",
      "existing_controls": "Power tool use only after formal training and assessment. Restricted to specific tools approved for apprentice use. Supervised at all times when using power tools. PPE provided and enforced.",
      "additional_controls": "Tool competency checklist maintained. Progressive tool access as skills develop. No use of angle grinders, chop saws, or other high-risk tools until age 18.",
      "severity": 4,
      "likelihood": 3,
      "risk_level": "High",
      "residual_severity": 4,
      "residual_likelihood": 1,
      "residual_risk": "Low"
    },
    {
      "id": "yp6",
      "hazard": "Hazardous Substances (COSHH)",
      "who_affected": "Young Person (Apprentice)",
      "existing_controls": "Young person not permitted to handle hazardous substances without supervision. COSHH assessments reviewed with apprentice. Appropriate PPE provided. No exposure to asbestos or lead-based materials.",
      "additional_controls": "COSHH data sheets reviewed before each task. Substitute less hazardous products where possible. Exposure monitoring where applicable.",
      "severity": 4,
      "likelihood": 2,
      "risk_level": "Medium",
      "residual_severity": 4,
      "residual_likelihood": 1,
      "residual_risk": "Low"
    },
    {
      "id": "yp7",
      "hazard": "Lone Working",
      "who_affected": "Young Person (Apprentice)",
      "existing_controls": "Young persons under 18 are strictly prohibited from lone working at any time. Must always be accompanied by a competent adult supervisor on site.",
      "additional_controls": "Supervisor to confirm apprentice presence at all sign-in/sign-out points. Office to verify pairing arrangements before dispatch.",
      "severity": 4,
      "likelihood": 2,
      "risk_level": "Medium",
      "residual_severity": 4,
      "residual_likelihood": 1,
      "residual_risk": "Low"
    },
    {
      "id": "yp8",
      "hazard": "Workplace Stress and Wellbeing",
      "who_affected": "Young Person (Apprentice)",
      "existing_controls": "Regular welfare checks by supervisor and HR. Open-door policy for concerns. Working hours limited in accordance with Working Time Regulations (no night work, maximum 8 hours per day, 40 hours per week). Adequate rest breaks provided.",
      "additional_controls": "Mental health first aider available. Apprentice mentor assigned in addition to supervising engineer. Regular progress reviews with training provider.",
      "severity": 3,
      "likelihood": 2,
      "risk_level": "Medium",
      "residual_severity": 3,
      "residual_likelihood": 1,
      "residual_risk": "Low"
    },
    {
      "id": "yp9",
      "hazard": "Driving and Transport",
      "who_affected": "Young Person (Apprentice)",
      "existing_controls": "Apprentice is a passenger only until holding full driving licence and completing company driver assessment. Seatbelts worn at all times. No use of company vehicles without authorisation.",
      "additional_controls": "Journey planning to minimise travel time. Adequate rest between long journeys. No driving after excessive working hours.",
      "severity": 4,
      "likelihood": 2,
      "risk_level": "Medium",
      "residual_severity": 4,
      "residual_likelihood": 1,
      "residual_risk": "Low"
    },
    {
      "id": "yp10",
      "hazard": "Noise Exposure",
      "who_affected": "Young Person (Apprentice)",
      "existing_controls": "Hearing protection provided during sounder testing. Exposure time limited. Warning given before alarm activation. Young person positioned away from direct sounder output where possible.",
      "additional_controls": "Ear defenders (not just plugs) provided for all sounder tests. Maximum continuous exposure of 5 seconds per test. Regular hearing checks if frequent sounder testing.",
      "severity": 3,
      "likelihood": 3,
      "risk_level": "Medium",
      "residual_severity": 2,
      "residual_likelihood": 1,
      "residual_risk": "Low"
    }
  ]'::jsonb,
  '[
    {
      "step_number": 1,
      "description": "Pre-Site: Review this Young Persons Risk Assessment with the apprentice before attending site. Confirm the apprentice understands all restrictions and supervision requirements. Record confirmation.",
      "responsible_person": "Supervising Engineer",
      "equipment_required": "Young Persons RA document, training record"
    },
    {
      "step_number": 2,
      "description": "Arrival: Sign in apprentice alongside supervising engineer. Introduce apprentice to site contact. Review site-specific hazards including asbestos register, fire procedures, and evacuation routes.",
      "responsible_person": "Supervising Engineer",
      "equipment_required": "ID badges, site induction materials"
    },
    {
      "step_number": 3,
      "description": "Toolbox Talk: Conduct daily toolbox talk covering specific tasks planned, hazards identified, and controls in place. Allow apprentice to ask questions. Document attendance.",
      "responsible_person": "Supervising Engineer",
      "equipment_required": "Toolbox talk record sheet"
    },
    {
      "step_number": 4,
      "description": "Task Allocation: Assign age-appropriate tasks only. Demonstrate each new task before apprentice attempts it. Maintain line-of-sight supervision at all times.",
      "responsible_person": "Supervising Engineer",
      "equipment_required": "Task-specific tools and PPE"
    },
    {
      "step_number": 5,
      "description": "Ongoing Supervision: Monitor apprentice continuously. Check understanding regularly. Intervene immediately if unsafe practices observed. Provide constructive feedback.",
      "responsible_person": "Supervising Engineer",
      "equipment_required": "N/A"
    },
    {
      "step_number": 6,
      "description": "Welfare Checks: Ensure adequate rest breaks (minimum 30 minutes after 4.5 hours). Monitor for fatigue, especially in hot or cold environments. Ensure access to drinking water and welfare facilities.",
      "responsible_person": "Supervising Engineer",
      "equipment_required": "N/A"
    },
    {
      "step_number": 7,
      "description": "End of Day: Debrief with apprentice. Review what was learned. Record any training competencies achieved. Sign out together.",
      "responsible_person": "Supervising Engineer",
      "equipment_required": "Training log, competency record"
    },
    {
      "step_number": 8,
      "description": "Reporting: Complete apprentice site attendance record. Report any incidents, near misses, or concerns to office and training provider within 24 hours.",
      "responsible_person": "Supervising Engineer",
      "equipment_required": "Incident report form, apprentice log"
    }
  ]'::jsonb,
  ARRAY['Safety Boots (EN ISO 20345)', 'Hi-Vis Vest (EN ISO 20471)', 'Safety Glasses (EN 166)', 'Ear Defenders (EN 352)', 'Hard Hat (EN 397) - where required', 'Gloves (EN 388) - task appropriate'],
  'In the event of an emergency:\n1. Stop all work immediately and make the area safe\n2. Supervising engineer to account for the apprentice at all times\n3. Evacuate to the designated assembly point together - apprentice must stay with supervisor\n4. Call 999 if emergency services required\n5. Administer first aid if trained and safe to do so\n6. Report incident to office immediately\n7. Contact apprentice parent/guardian if injury occurs\n8. Contact training provider within 24 hours\n9. Complete RIDDOR report if applicable (note: lower reporting thresholds apply for young persons)\n10. Do not resume work until investigation complete and further controls implemented',
  'Ensure the following are confirmed for each site visit with a young person:\n- Asbestos register reviewed (apprentice must not enter areas with ACMs)\n- Site-specific induction completed\n- Welfare facilities available\n- Emergency exits and procedures confirmed\n- Supervision arrangements confirmed with site contact\n- Working hours do not exceed legal limits\n- Parent/guardian emergency contact details available',
  50,
  true
);