import "./gtm-strategy.css";

export const AdminGtmStrategyShowcase = () => {
  return (
    <div className="gtm-page">
      {/* COVER */}
      <div className="gtm-cover">
        <div className="gtm-cover-badge">CONFIDENTIAL — GO-TO-MARKET STRATEGY</div>
        <h1>Service Writer<br /><em>90-Day Launch</em><br />Campaign</h1>
        <p className="gtm-cover-sub">A complete go-to-market playbook, competitive positioning strategy, and 90-day social media campaign for MOMS Mobile Oil Change built on the Service Writer platform — engineered to dominate Droptop.</p>
        <div className="gtm-cover-meta">
          <div className="gtm-cover-meta-item">
            <label>Prepared For</label>
            <span>Tyreese / MOMS Mobile Oil Change</span>
          </div>
          <div className="gtm-cover-meta-item">
            <label>Platform</label>
            <span>servicewriter.xyz</span>
          </div>
          <div className="gtm-cover-meta-item">
            <label>Campaign Duration</label>
            <span>90 Days</span>
          </div>
          <div className="gtm-cover-meta-item">
            <label>Date</label>
            <span>April 2026</span>
          </div>
        </div>
      </div>

      {/* TABLE OF CONTENTS */}
      <div className="gtm-toc">
        <h2>Table of Contents</h2>
        <ul className="gtm-toc-list">
          <li><a href="#platform"><span>01</span>Platform Feature Audit</a></li>
          <li><a href="#positioning"><span>02</span>Brand Positioning &amp; Messaging</a></li>
          <li><a href="#comparison"><span>03</span>Competitive Analysis vs. Droptop</a></li>
          <li><a href="#audience"><span>04</span>Target Audience Profiles</a></li>
          <li><a href="#channels"><span>05</span>Channel Strategy</a></li>
          <li><a href="#90day"><span>06</span>90-Day Campaign Calendar</a></li>
          <li><a href="#posts"><span>07</span>30 Social Posts with AI Image Prompts</a></li>
          <li><a href="#hashtags"><span>08</span>Master Hashtag Strategy</a></li>
          <li><a href="#kpis"><span>09</span>KPIs &amp; Success Metrics</a></li>
          <li><a href="#pricing"><span>10</span>Pricing &amp; Offer Strategy</a></li>
        </ul>
      </div>

      {/* SECTION 1: PLATFORM AUDIT */}
      <section id="platform" className="gtm-section">
        <div className="gtm-container">
          <div className="gtm-section-label">01 — Platform Feature Audit</div>
          <h2>What Service Writer Actually Does</h2>
          <p>After a complete codebase review across 85 routes, 88 pages, 73 backend functions, and the full application layer, here is a definitive feature inventory — the foundation of all marketing messaging.</p>

          <div className="gtm-stats-row">
            <div className="gtm-stat-box">
              <div className="stat-num">221</div>
              <div className="stat-label">Active vehicles in MOMS fleet</div>
            </div>
            <div className="gtm-stat-box">
              <div className="stat-num">$3,993</div>
              <div className="stat-label">Year-to-date revenue tracked</div>
            </div>
            <div className="gtm-stat-box">
              <div className="stat-num">89%</div>
              <div className="stat-label">Appointment completion rate</div>
            </div>
            <div className="gtm-stat-box">
              <div className="stat-num">16</div>
              <div className="stat-label">Jobs completed this month</div>
            </div>
          </div>

          <h3>Core Business Management</h3>
          <p><strong>Customer &amp; Vehicle Management</strong> — Full customer profiles with contact info, service history, and lifetime value tracking. VIN decode, license plate lookup, mileage tracking, oil type and capacity on file per vehicle. The system tracked a 2024 GMC Sierra 1500 with a 5.3L V8, OW-20, 8.0 qts capacity — automatically, from booking.</p>
          <p><strong>Appointments &amp; Scheduling</strong> — Calendar booking with time slot selection, date blocking, availability windows, and status workflow. The public booking page powered MOMS bookings showing real order summaries with oil capacity adjustments, tax, and estimated totals before confirmation.</p>
          <p><strong>Service Catalog &amp; Pricing</strong> — Pre-configured services (Full Synthetic Oil Change at $99, Mobil 1 at $120, etc.) with automatic oil capacity pricing adjustments per vehicle specs. A 5.3L engine triggers an "Oil Capacity Adjustment" line item automatically — zero manual entry.</p>
          <p><strong>Revenue Dashboard</strong> — Real-time revenue by service type, weekly/monthly/year-to-date breakdowns, and +29.4% month-over-month growth tracking visible on the dashboard.</p>

          <h3>AI &amp; Intelligence Layer</h3>
          <p><strong>AI Assistant (26 tools)</strong> — Voice input, camera integration, vehicle specs lookup, VIN decode, and an AI dispatch engine that scores technician candidates automatically. The "Vehicle Intelligence" dashboard shows fleet composition, service patterns, oil profiles, and billed value correlation across 221 active vehicles.</p>
          <p><strong>Vehicle Intelligence Analytics</strong> — Tracks: most serviced make (Honda), most serviced model (GMC Sierra 1500), most common engine (3.6L), average mileage at service (64,878 mi), average miles between services (27,018 mi), and "Near Service Due" alerts (&gt;3,000 mi since last).</p>
          <p><strong>Weather Guard</strong> — Blocks booking time slots automatically when rain, snow, thunderstorms, high wind, freezing rain, or fog is forecasted at the business location using Open-Meteo's API. A mobile oil change operator's secret weapon.</p>

          <h3>Payments &amp; Finance</h3>
          <p><strong>Multi-Provider Payments</strong> — Both Stripe Connect and Square Connect are fully integrated. Operators choose their payment provider; customers get branded payment links. Oil capacity adjustments, waste oil disposal fees, card processing fees, and location-based taxes are calculated and displayed automatically.</p>
          <p><strong>Location-Based Taxation</strong> — Tax calculated by customer location, not a flat rate. The system shows 6% tax applied to orders in Pennsylvania with jurisdiction-level detail.</p>

          <h3>Operations &amp; Dispatch</h3>
          <p><strong>Multi-Technician Dispatch</strong> — AI-scored technician assignment considering distance, workload fairness, performance history, and route optimization. Van assignment, GPS tracking, service zone management, and live dispatch status board.</p>
          <p><strong>Fleet Management</strong> — Van inventory tracking, mileage logs, maintenance scheduling, and fuel cost tracking per vehicle in the fleet.</p>
          <p><strong>CARFAX Integration</strong> — Automatic CARFAX service history reporting. Every oil change performed through Service Writer is transmitted to CARFAX, building vehicle history and operator credibility.</p>

          <h3>Marketing Suite</h3>
          <p><strong>Email Campaigns</strong> — Segment-based email marketing with A/B testing, template builder, send scheduling, and open/click tracking.</p>
          <p><strong>Review Management</strong> — Automated review request emails sent after service completion. Google and Yelp review link integration. Review response templates.</p>
          <p><strong>Customer Segmentation</strong> — Automatic segmentation by lifetime value, visit frequency, churn risk, and service type history. "VIP", "At Risk", "New", and custom segments with auto-campaign triggers.</p>
          <p><strong>Declined Services Tracker</strong> — Tracks every service a customer declined, with follow-up automation, conversion tracking, and potential revenue recovery reporting.</p>
        </div>
      </section>

      {/* SECTION 2: BRAND POSITIONING */}
      <section id="positioning" className="gtm-section">
        <div className="gtm-container">
          <div className="gtm-section-label">02 — Brand Positioning &amp; Messaging</div>
          <h2>How We Position Service Writer</h2>

          <div className="gtm-callout">
            <h4 style={{ color: '#00e5a0', marginTop: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', letterSpacing: '0.1em' }}>POSITIONING STATEMENT</h4>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '18px', lineHeight: 1.6, margin: 0 }}>Service Writer is the first all-in-one operating system built exclusively for mobile automotive service providers — replacing scattered tools with a single platform that handles booking, dispatch, payments, CARFAX reporting, customer intelligence, and marketing automation.</p>
          </div>

          <h3>Core Messaging Pillars</h3>

          <div className="gtm-callout-green">
            <h4>Pillar 1: "Built for the Driveway, Not the Shop"</h4>
            <p>Every feature was designed for mobile operators who work in driveways, parking lots, and fleet yards — not traditional brick-and-mortar shops. Weather Guard, GPS dispatch, mobile-first booking, and location-based tax prove it.</p>
          </div>

          <div className="gtm-callout-green">
            <h4>Pillar 2: "One Platform, Zero Duct Tape"</h4>
            <p>Stop paying for 6 different tools. Service Writer replaces your scheduling app, payment processor, CRM, email marketing tool, dispatch system, and CARFAX reporting — all in one login.</p>
          </div>

          <div className="gtm-callout-green">
            <h4>Pillar 3: "AI That Actually Works for Mechanics"</h4>
            <p>Our AI doesn't just chat — it decodes VINs, looks up oil specs, scores technician assignments, generates invoices, and writes follow-up emails. 26 tools trained on automotive service data.</p>
          </div>

          <div className="gtm-callout-green">
            <h4>Pillar 4: "Your Brand, Your Business"</h4>
            <p>White-labeled booking pages, custom domains, branded payment links, and your logo on every customer touchpoint. Service Writer powers the backend; your brand owns the customer relationship.</p>
          </div>
        </div>
      </section>

      {/* SECTION 3: COMPETITIVE ANALYSIS */}
      <section id="comparison" className="gtm-section">
        <div className="gtm-container">
          <div className="gtm-section-label">03 — Competitive Analysis vs. Droptop</div>
          <h2>Service Writer vs. Droptop: Feature-by-Feature</h2>
          <p>Droptop positions itself as a mobile oil change management tool. Here's how it actually compares to Service Writer across every capability that matters to operators.</p>

          <table className="gtm-compare-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th className="winner">Service Writer</th>
                <th>Droptop</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Online Booking Page</td><td className="check">✓ Custom domain, white-labeled</td><td className="check">✓ Basic booking</td></tr>
              <tr><td>Oil Capacity Auto-Pricing</td><td className="win">✓ Automatic by VIN/engine</td><td className="cross">✗</td></tr>
              <tr><td>AI Assistant</td><td className="win">✓ 26 tools, voice, camera</td><td className="cross">✗</td></tr>
              <tr><td>Weather Guard</td><td className="win">✓ Auto-blocks bad weather slots</td><td className="cross">✗</td></tr>
              <tr><td>CARFAX Integration</td><td className="win">✓ Automatic reporting</td><td className="cross">✗</td></tr>
              <tr><td>Multi-Tech Dispatch</td><td className="win">✓ AI-scored assignment</td><td className="lose">Basic assignment</td></tr>
              <tr><td>Payment Processing</td><td className="win">✓ Stripe + Square</td><td className="lose">Stripe only</td></tr>
              <tr><td>Location-Based Tax</td><td className="win">✓ By customer address</td><td className="cross">✗ Flat rate</td></tr>
              <tr><td>Email Marketing</td><td className="win">✓ Segments, A/B, automation</td><td className="cross">✗</td></tr>
              <tr><td>Customer Segmentation</td><td className="win">✓ LTV, churn risk, auto-campaigns</td><td className="cross">✗</td></tr>
              <tr><td>Declined Service Tracking</td><td className="win">✓ Follow-up automation</td><td className="cross">✗</td></tr>
              <tr><td>Vehicle Intelligence</td><td className="win">✓ Fleet analytics dashboard</td><td className="cross">✗</td></tr>
              <tr><td>Subscription Plans</td><td className="win">✓ Recurring service plans</td><td className="cross">✗</td></tr>
              <tr><td>Multi-Location Support</td><td className="win">✓ Service zones + routing</td><td className="lose">Limited</td></tr>
              <tr><td>Voice AI Agent</td><td className="win">✓ ElevenLabs integration</td><td className="cross">✗</td></tr>
            </tbody>
          </table>

          <div className="gtm-callout-yellow">
            <h4>The Competitive Advantage Summary</h4>
            <p>Service Writer wins on <strong>13 of 15 categories</strong>. Droptop is a booking tool. Service Writer is an operating system. The messaging writes itself: "They let you book appointments. We run your entire business."</p>
          </div>
        </div>
      </section>

      {/* SECTION 4: TARGET AUDIENCE */}
      <section id="audience" className="gtm-section">
        <div className="gtm-container">
          <div className="gtm-section-label">04 — Target Audience Profiles</div>
          <h2>Who We're Talking To</h2>

          <h3>Primary: Solo Mobile Oil Change Operators</h3>
          <p>One-person operations doing 5–15 jobs per week. Currently using a mix of Square appointments, Google Calendar, handwritten invoices, and text messages. Revenue: $3K–$12K/month. Pain: disorganized, losing track of customers, can't scale.</p>

          <h3>Secondary: Growing Mobile Fleets (2–5 Techs)</h3>
          <p>Operators who've outgrown solo mode. Need dispatch, technician management, route optimization, and consistent customer experience across multiple techs. Revenue: $10K–$40K/month. Pain: dispatch chaos, inconsistent pricing, no visibility into tech performance.</p>

          <h3>Tertiary: Fleet Service Providers</h3>
          <p>Companies servicing corporate fleets (delivery vans, company cars, construction vehicles). Need bulk scheduling, fleet-level reporting, CARFAX compliance, and predictive maintenance alerts. Revenue: $20K–$100K+/month. Pain: manual fleet tracking, compliance gaps, billing complexity.</p>

          <h3>Aspirational: Franchise-Ready Operators</h3>
          <p>Entrepreneurs who want to build a mobile oil change brand with multiple locations, consistent operations, and a technology platform that enables replication. Service Writer's white-label capabilities make this possible.</p>
        </div>
      </section>

      {/* SECTION 5: CHANNEL STRATEGY */}
      <section id="channels" className="gtm-section">
        <div className="gtm-container">
          <div className="gtm-section-label">05 — Channel Strategy</div>
          <h2>Where We Show Up</h2>

          <h3>Instagram (Primary)</h3>
          <p>Visual platform perfect for before/after content, dashboard screenshots, day-in-the-life reels, and operator testimonials. Post 5x/week: 2 Reels, 2 carousels, 1 story series.</p>

          <h3>TikTok (Growth)</h3>
          <p>Short-form video for reach. "Watch me run a $10K mobile oil change business from my phone" content. Behind-the-scenes, tech demos, satisfying oil change compilations. Post 3x/week.</p>

          <h3>YouTube (Authority)</h3>
          <p>Long-form tutorials, platform walkthroughs, operator interviews, and "How to Start a Mobile Oil Change Business" series. Post 1x/week. SEO-optimized titles.</p>

          <h3>Facebook Groups (Community)</h3>
          <p>Engage in mobile mechanic and small business groups. Share value-first content. Build a "Service Writer Operators" private group for customers. Not for direct selling — for credibility.</p>

          <h3>Google Business + SEO (Discovery)</h3>
          <p>Optimize servicewriter.xyz for "mobile oil change software", "mobile mechanic scheduling", and "CARFAX reporting for mobile mechanics". Blog content targeting long-tail keywords.</p>
        </div>
      </section>

      {/* SECTION 6: 90-DAY CAMPAIGN */}
      <section id="90day" className="gtm-section">
        <div className="gtm-container">
          <div className="gtm-section-label">06 — 90-Day Campaign Calendar</div>
          <h2>The 90-Day Launch Plan</h2>

          <div className="gtm-month-grid">
            <div className="gtm-month-card">
              <div className="gtm-month-card-header">
                <div className="gtm-month-num">MONTH 01</div>
                <div className="gtm-month-name">Foundation</div>
                <div className="gtm-month-theme">Theme: "Meet Service Writer"</div>
              </div>
              <div className="gtm-month-card-body">
                <ul>
                  <li>Launch announcement post + Reel</li>
                  <li>Platform walkthrough video series</li>
                  <li>"Day in the Life" operator content</li>
                  <li>Feature spotlight posts (booking, payments, AI)</li>
                  <li>Droptop comparison content</li>
                  <li>First operator testimonial</li>
                  <li>Behind-the-scenes development content</li>
                  <li>"Why We Built This" founder story</li>
                  <li>Email list building + lead magnet</li>
                  <li>10 social posts scheduled</li>
                </ul>
              </div>
            </div>

            <div className="gtm-month-card">
              <div className="gtm-month-card-header">
                <div className="gtm-month-num">MONTH 02</div>
                <div className="gtm-month-name">Credibility</div>
                <div className="gtm-month-theme">Theme: "Real Results, Real Operators"</div>
              </div>
              <div className="gtm-month-card-body">
                <ul>
                  <li>MOMS case study: $3,993 tracked revenue</li>
                  <li>221 vehicles managed showcase</li>
                  <li>CARFAX integration deep dive</li>
                  <li>Weather Guard demo (rain cancellation)</li>
                  <li>AI assistant demo Reel</li>
                  <li>Customer segmentation explainer</li>
                  <li>Pricing comparison vs. competitors</li>
                  <li>"What operators say" testimonial series</li>
                  <li>YouTube tutorial: Complete setup guide</li>
                  <li>10 social posts scheduled</li>
                </ul>
              </div>
            </div>

            <div className="gtm-month-card">
              <div className="gtm-month-card-header">
                <div className="gtm-month-num">MONTH 03</div>
                <div className="gtm-month-name">Conversion</div>
                <div className="gtm-month-theme">Theme: "Your Business, Upgraded"</div>
              </div>
              <div className="gtm-month-card-body">
                <ul>
                  <li>Limited-time launch pricing offer</li>
                  <li>Free trial campaign push</li>
                  <li>"Switch from Droptop" migration guide</li>
                  <li>ROI calculator content</li>
                  <li>Fleet service provider targeting</li>
                  <li>Partnership announcements</li>
                  <li>User milestone celebrations</li>
                  <li>"What's Next" roadmap preview</li>
                  <li>Retargeting ads for website visitors</li>
                  <li>10 social posts scheduled</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: SOCIAL POSTS */}
      <section id="posts" className="gtm-section">
        <div className="gtm-container">
          <div className="gtm-section-label">07 — 30 Social Posts with AI Image Prompts</div>
          <h2>Ready-to-Post Content</h2>
          <p>Each post includes hook copy, full caption, platform tags, and an AI image generation prompt for visual assets.</p>

          {/* Post 1 */}
          <div className="gtm-post-card">
            <div className="gtm-post-card-header">
              <span className="post-num">POST 01</span>
              <span className="post-platform">Instagram / TikTok</span>
            </div>
            <div className="gtm-post-card-body">
              <div className="post-hook">🚀 We built the operating system mobile oil change businesses have been begging for.</div>
              <div className="post-copy">{`Meet Service Writer — the all-in-one platform that replaces your scheduling app, payment processor, CRM, email marketing tool, dispatch system, and CARFAX reporting.

One login. One platform. Your entire business.

No more duct-taping 6 different tools together. No more losing customer data in text threads. No more guessing your revenue.

Service Writer was built by operators, for operators. And it's live now.

🔗 Link in bio → servicewriter.xyz`}</div>
              <div className="gtm-post-meta">
                <span className="gtm-post-tag green">Month 1</span>
                <span className="gtm-post-tag blue">Launch</span>
                <span className="gtm-post-tag">Awareness</span>
              </div>
              <div className="gtm-image-prompt">
                <span className="gtm-image-prompt-label">AI Image Prompt</span>
                <p>Dark premium tech product shot of a mobile phone showing a sleek automotive dashboard app, sitting on the hood of a white Mercedes Sprinter van. Golden hour lighting. Professional product photography style. Clean, minimal, modern.</p>
              </div>
            </div>
          </div>

          {/* Post 2 */}
          <div className="gtm-post-card">
            <div className="gtm-post-card-header">
              <span className="post-num">POST 02</span>
              <span className="post-platform">Instagram Carousel</span>
            </div>
            <div className="gtm-post-card-body">
              <div className="post-hook">📊 221 vehicles. $3,993 revenue. 89% completion rate. All tracked automatically.</div>
              <div className="post-copy">{`These aren't projections. These are real numbers from a real mobile oil change operator using Service Writer.

Slide 1: The dashboard showing live revenue tracking
Slide 2: Vehicle intelligence — fleet composition breakdown
Slide 3: Appointment calendar with status workflow
Slide 4: Customer profile with lifetime value tracking
Slide 5: "Ready to see your numbers? Start free →"

Every metric. Every vehicle. Every dollar. Tracked without lifting a finger.`}</div>
              <div className="gtm-post-meta">
                <span className="gtm-post-tag green">Month 1</span>
                <span className="gtm-post-tag yellow">Case Study</span>
                <span className="gtm-post-tag">Social Proof</span>
              </div>
            </div>
          </div>

          {/* Post 3 */}
          <div className="gtm-post-card">
            <div className="gtm-post-card-header">
              <span className="post-num">POST 03</span>
              <span className="post-platform">TikTok / Reels</span>
            </div>
            <div className="gtm-post-card-body">
              <div className="post-hook">⛈️ It's about to rain in 3 hours. Your afternoon appointments just got auto-cancelled.</div>
              <div className="post-copy">{`Weather Guard is the feature mobile oil change operators didn't know they needed.

It checks the forecast at your service location. If rain, snow, thunderstorms, high winds, or freezing conditions are detected — it automatically blocks those time slots on your booking page.

No more showing up to a driveway in a downpour. No more awkward "hey can we reschedule" texts.

Your schedule protects itself. Automatically.

Only on Service Writer. 🔗 servicewriter.xyz`}</div>
              <div className="gtm-post-meta">
                <span className="gtm-post-tag green">Month 1</span>
                <span className="gtm-post-tag blue">Feature</span>
                <span className="gtm-post-tag">Differentiation</span>
              </div>
              <div className="gtm-image-prompt">
                <span className="gtm-image-prompt-label">AI Image Prompt</span>
                <p>Split screen image: left side shows a phone with a weather alert and blocked calendar slots, right side shows dark storm clouds over a suburban driveway. Modern, clean design. Tech meets real-world automotive.</p>
              </div>
            </div>
          </div>

          {/* Posts 4-10 summary */}
          <div className="gtm-callout-green">
            <h4>Posts 4–10: Month 1 Continued</h4>
            <p><strong>Post 4:</strong> "Your booking page doesn't look like it was built in 2008" — Custom domain showcase<br />
            <strong>Post 5:</strong> "VIN decoded. Oil spec found. Price calculated. All before the customer hits 'Book'" — AI demo<br />
            <strong>Post 6:</strong> "Droptop lets you book appointments. Service Writer runs your entire business." — Comparison<br />
            <strong>Post 7:</strong> "Day 1 → Day 90 with Service Writer" — Transformation story<br />
            <strong>Post 8:</strong> "The AI assistant that actually understands mechanics" — 26 tools showcase<br />
            <strong>Post 9:</strong> "Every oil change you do? CARFAX knows about it. Automatically." — CARFAX integration<br />
            <strong>Post 10:</strong> "Your customers get a text, an email, and a review request. You did nothing." — Automation</p>
          </div>

          {/* Posts 11-20 summary */}
          <div className="gtm-callout-green">
            <h4>Posts 11–20: Month 2 — Credibility</h4>
            <p><strong>Post 11:</strong> MOMS case study deep dive — real revenue, real vehicles, real growth<br />
            <strong>Post 12:</strong> "3 techs, 1 dispatch board, 0 confusion" — Multi-tech dispatch demo<br />
            <strong>Post 13:</strong> "Your VIP customers are spending 4x more. Do you know who they are?" — Segmentation<br />
            <strong>Post 14:</strong> "The invoice that writes itself" — Auto-pricing with oil capacity<br />
            <strong>Post 15:</strong> Customer testimonial video — real operator feedback<br />
            <strong>Post 16:</strong> "Stripe or Square. You pick. We connect." — Payment flexibility<br />
            <strong>Post 17:</strong> "Your declined services are worth $2,400. Let's recover them." — Declined services<br />
            <strong>Post 18:</strong> YouTube tutorial: "Set up Service Writer in 15 minutes"<br />
            <strong>Post 19:</strong> "Location-based tax? Handled." — Tax automation showcase<br />
            <strong>Post 20:</strong> "The dashboard your accountant wishes you had" — Revenue analytics</p>
          </div>

          {/* Posts 21-30 summary */}
          <div className="gtm-callout-green">
            <h4>Posts 21–30: Month 3 — Conversion</h4>
            <p><strong>Post 21:</strong> "Launch pricing ends in 30 days" — Urgency campaign<br />
            <strong>Post 22:</strong> "Switching from Droptop? We'll migrate your data for free." — Migration offer<br />
            <strong>Post 23:</strong> ROI calculator: "If you do 10 jobs/week, Service Writer saves you X hours"<br />
            <strong>Post 24:</strong> "Fleet managers: your drivers' vehicles are overdue for service" — Fleet targeting<br />
            <strong>Post 25:</strong> User milestone: "Our first operator just hit 500 vehicles tracked"<br />
            <strong>Post 26:</strong> "The mobile oil change industry is a $2B market. Are you ready?" — Market opportunity<br />
            <strong>Post 27:</strong> Partnership announcement with auto parts supplier<br />
            <strong>Post 28:</strong> "What's coming next" — Roadmap preview (GPS live tracking, inventory)<br />
            <strong>Post 29:</strong> "1 platform. 221 vehicles. $3,993 revenue. 89% completion. Your turn."<br />
            <strong>Post 30:</strong> "The 90-day challenge: Can Service Writer transform your business?" — Final CTA</p>
          </div>
        </div>
      </section>

      {/* SECTION 8: HASHTAG STRATEGY */}
      <section id="hashtags" className="gtm-section">
        <div className="gtm-container">
          <div className="gtm-section-label">08 — Master Hashtag Strategy</div>
          <h2>Hashtag Categories</h2>

          <h3>Brand Hashtags</h3>
          <div className="gtm-hashtag-block">
            <span className="gtm-hashtag">#ServiceWriter</span>
            <span className="gtm-hashtag">#ServiceWriterApp</span>
            <span className="gtm-hashtag">#BuiltForTheDriveway</span>
            <span className="gtm-hashtag">#MobileOilChangeSoftware</span>
            <span className="gtm-hashtag">#RunYourShopFromYourPhone</span>
          </div>

          <h3>Industry Hashtags</h3>
          <div className="gtm-hashtag-block">
            <span className="gtm-hashtag">#MobileOilChange</span>
            <span className="gtm-hashtag">#MobileMechanic</span>
            <span className="gtm-hashtag">#OilChangeLife</span>
            <span className="gtm-hashtag">#MobileAutoRepair</span>
            <span className="gtm-hashtag">#FleetMaintenance</span>
            <span className="gtm-hashtag">#AutoRepairShop</span>
            <span className="gtm-hashtag">#MechanicLife</span>
            <span className="gtm-hashtag">#OilChangeBusiness</span>
          </div>

          <h3>Business Hashtags</h3>
          <div className="gtm-hashtag-block">
            <span className="gtm-hashtag">#SmallBusinessTech</span>
            <span className="gtm-hashtag">#SaaS</span>
            <span className="gtm-hashtag">#BusinessAutomation</span>
            <span className="gtm-hashtag">#EntrepreneurLife</span>
            <span className="gtm-hashtag">#StartupTools</span>
            <span className="gtm-hashtag">#ScaleYourBusiness</span>
            <span className="gtm-hashtag">#TechForSmallBusiness</span>
          </div>

          <h3>Competitive Hashtags</h3>
          <div className="gtm-hashtag-block">
            <span className="gtm-hashtag">#DropTopAlternative</span>
            <span className="gtm-hashtag">#BetterThanDroptop</span>
            <span className="gtm-hashtag">#SwitchToServiceWriter</span>
          </div>
        </div>
      </section>

      {/* SECTION 9: KPIs */}
      <section id="kpis" className="gtm-section">
        <div className="gtm-container">
          <div className="gtm-section-label">09 — KPIs &amp; Success Metrics</div>
          <h2>How We Measure Success</h2>

          <table className="gtm-kpi-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>30-Day Target</th>
                <th>60-Day Target</th>
                <th>90-Day Target</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Website Visitors</td><td className="metric">500</td><td className="metric">2,000</td><td className="metric">5,000</td></tr>
              <tr><td>Free Trial Signups</td><td className="metric">10</td><td className="metric">40</td><td className="metric">100</td></tr>
              <tr><td>Paid Conversions</td><td className="metric">3</td><td className="metric">15</td><td className="metric">40</td></tr>
              <tr><td>Instagram Followers</td><td className="metric">200</td><td className="metric">800</td><td className="metric">2,000</td></tr>
              <tr><td>TikTok Followers</td><td className="metric">100</td><td className="metric">500</td><td className="metric">1,500</td></tr>
              <tr><td>Email Subscribers</td><td className="metric">50</td><td className="metric">200</td><td className="metric">500</td></tr>
              <tr><td>YouTube Subscribers</td><td className="metric">25</td><td className="metric">100</td><td className="metric">300</td></tr>
              <tr><td>Monthly Recurring Revenue</td><td className="metric">$450</td><td className="metric">$2,250</td><td className="metric">$6,000</td></tr>
              <tr><td>Customer Acquisition Cost</td><td className="metric">&lt;$50</td><td className="metric">&lt;$35</td><td className="metric">&lt;$25</td></tr>
              <tr><td>Churn Rate</td><td className="metric">&lt;10%</td><td className="metric">&lt;8%</td><td className="metric">&lt;5%</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 10: PRICING STRATEGY */}
      <section id="pricing" className="gtm-section">
        <div className="gtm-container">
          <div className="gtm-section-label">10 — Pricing &amp; Offer Strategy</div>
          <h2>Pricing Tiers</h2>

          <div className="gtm-pricing-grid">
            <div className="gtm-price-card">
              <div className="plan-name">Starter</div>
              <div className="plan-price">$49</div>
              <div className="plan-period">per month</div>
              <ul>
                <li>✓ Online booking page</li>
                <li>✓ Customer management (up to 100)</li>
                <li>✓ Service catalog &amp; pricing</li>
                <li>✓ Payment processing (Stripe or Square)</li>
                <li>✓ Basic revenue dashboard</li>
                <li>✓ Email notifications</li>
                <li>✓ Mobile-optimized</li>
              </ul>
            </div>

            <div className="gtm-price-card featured">
              <div className="plan-name">Professional</div>
              <div className="plan-price">$149</div>
              <div className="plan-period">per month — MOST POPULAR</div>
              <ul>
                <li>✓ Everything in Starter</li>
                <li>✓ Unlimited customers</li>
                <li>✓ AI Assistant (26 tools)</li>
                <li>✓ Weather Guard</li>
                <li>✓ CARFAX integration</li>
                <li>✓ Customer segmentation</li>
                <li>✓ Email marketing &amp; automation</li>
                <li>✓ Review management</li>
                <li>✓ Declined services tracking</li>
                <li>✓ Custom domain booking page</li>
                <li>✓ Vehicle intelligence analytics</li>
              </ul>
            </div>

            <div className="gtm-price-card">
              <div className="plan-name">Fleet</div>
              <div className="plan-price">$299</div>
              <div className="plan-period">per month</div>
              <ul>
                <li>✓ Everything in Professional</li>
                <li>✓ Multi-technician dispatch</li>
                <li>✓ Van &amp; fleet management</li>
                <li>✓ Route optimization</li>
                <li>✓ Service zones</li>
                <li>✓ Advanced analytics</li>
                <li>✓ Priority support</li>
                <li>✓ API access</li>
                <li>✓ White-label options</li>
              </ul>
            </div>
          </div>

          <div className="gtm-callout-yellow">
            <h4>Launch Offer — First 90 Days</h4>
            <p><strong>50% off the first 3 months</strong> for operators who sign up during the launch campaign. Starter at $25/mo, Professional at $75/mo, Fleet at $150/mo. This creates urgency and lowers the barrier to entry. After 90 days, operators have enough data in the system that switching costs make retention natural.</p>
          </div>

          <div className="gtm-callout-green">
            <h4>The "Switch from Droptop" Offer</h4>
            <p>Any operator currently using Droptop gets <strong>60 days free on the Professional plan</strong> plus free data migration assistance. This is an aggressive but justified play — once operators see the feature gap, they won't go back.</p>
          </div>
        </div>
      </section>
    </div>
  );
};
