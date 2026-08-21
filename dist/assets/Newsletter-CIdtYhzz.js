import{a1 as F,F as f,D as ce,w as o,I as p,v as e,a5 as E,aJ as le,B as x,a6 as H,a7 as D,a8 as M,O as k}from"./index-BxnhNaIA.js";import{A as me}from"./AppLayout-BqlShDHB.js";import{C as m,a as d,b as P,c as B,d as J}from"./card-CYWc--0F.js";import{I as y}from"./input-BbXtMVrO.js";import{T as I}from"./textarea-BCSfO847.js";import{S as V}from"./switch-DULL3oGv.js";import{L as c}from"./label-BVUPnue_.js";import{P as Y}from"./plus-DS8tYerr.js";import{M as N}from"./mail-j_PJiQ75.js";import{U as G}from"./users-BtcTloqh.js";import{C as U}from"./calendar-3pz_sths.js";import{E as de}from"./eye-DeN4O4UK.js";import{S as he}from"./square-pen-K_fXRSg9.js";import{S}from"./sparkles-DQW_Qw2z.js";import{S as $}from"./ThemeModeSelect-4Z7J3Z9V.js";import{P as pe}from"./party-popper-D5JlnAUU.js";import{G as ue}from"./gift-CX9Ac2tc.js";import{S as xe}from"./snowflake-B0WRwZAb.js";import{M as fe,a as ve}from"./MarketingSiteChrome-BHkWc0Un.js";import"./scroll-area-DLtXRnh5.js";import"./index-CfkXo_9F.js";import"./index-BdQq_4o_.js";import"./index-CySpfTXW.js";import"./settings-BXgwDP56.js";import"./radio-D2WoXQVt.js";import"./file-text-D8cI8pHG.js";import"./calendar-clock-BGHVsghk.js";import"./clock-eINjHHB6.js";import"./cloud-rain-BjWjI8gY.js";import"./clipboard-list-PoXZcb6X.js";import"./zap-BILVRGr2.js";import"./truck-CMa00Vk-.js";import"./car-Cg5t20US.js";import"./database-D0KeZu4a.js";import"./book-open-CgRZ_gV5.js";import"./credit-card-CZt0tDT_.js";import"./receipt-CDE2Frc2.js";import"./package-Bfj7fNk-.js";import"./tag-Bvp3FYKt.js";import"./trending-up-Cd1URGyx.js";import"./star-DzA81_zf.js";import"./megaphone-pnTQgniO.js";import"./message-square-DCs0a44o.js";import"./useMediaQuery-fTFYwvfG.js";import"./avatar-DEzHQUzO.js";import"./index-C96JS-qd.js";import"./dropdown-menu-DEaYoQvi.js";import"./index-fea6s5rw.js";import"./chevron-right-CEl76CpL.js";import"./check-ClLybZY3.js";import"./circle-gLgXEwQ0.js";import"./NotificationBell-BTQIGA3X.js";import"./loader-circle-DszK8cCw.js";import"./formatDistanceToNow-BHWYRQsE.js";import"./differenceInMilliseconds-kdqS4gfB.js";import"./endOfMonth-CxYeaXjT.js";import"./trash-2-BOCxc4CF.js";import"./menu-BhxM6hzO.js";import"./log-out-DVGOabax.js";import"./graduation-cap-I_0MQNeh.js";import"./ProgressiveImage-BGavj7_c.js";import"./sliders-horizontal-BDPYQ_6M.js";import"./sheet-8yPR0VNC.js";import"./calendar-days-6HJ-sF3c.js";import"./house-zQEXxKkm.js";import"./audit-FxaHXpR5.js";import"./auth.command-CGNJXmYC.js";import"./PagePrimitives-DSSSRRZB.js";import"./skeleton-EEFq4ovm.js";import"./error-message-ezyorLEW.js";import"./triangle-alert-DdPOD33f.js";import"./index-CmxfzRUp.js";import"./select-DtEpsfbE.js";import"./chevron-down-CxW0X8oh.js";import"./MarketingLayout-TyftAUJW.js";import"./wrench-Byru4tmO.js";const ge=F("Flag",[["path",{d:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z",key:"i9b6wo"}],["line",{x1:"4",x2:"4",y1:"22",y2:"15",key:"1cm3nv"}]]);const ye=F("Heart",[["path",{d:"M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",key:"c3ymky"}]]);const K=F("Leaf",[["path",{d:"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z",key:"nnexq3"}],["path",{d:"M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",key:"mt58a7"}]]);async function je(r){const{data:i,error:a}=await f.from("newsletter_sequences").select("*").eq("user_id",r).order("created_at",{ascending:!1});if(a)throw a;return i||[]}async function we(r){const{data:i,error:a}=await f.from("newsletter_templates").select("*").eq("sequence_id",r).order("month_number");if(a)throw a;return i||[]}async function _e(r){const{count:i,error:a}=await f.from("newsletter_subscribers").select("*",{count:"exact",head:!0}).eq("user_id",r).eq("status","active");if(a)throw a;return i||0}async function be(r,i,a,j){const{data:w,error:l}=await f.from("newsletter_sequences").insert({user_id:r,name:i,description:a,is_active:!0,start_date:new Date().toISOString().split("T")[0]}).select().single();if(l)throw l;const v=j.map(_=>({..._,user_id:r,sequence_id:w.id})),{error:n}=await f.from("newsletter_templates").insert(v);if(n)throw n;return w.id}async function ke(r,i){const{error:a}=await f.from("newsletter_templates").update({is_active:i}).eq("id",r);if(a)throw a}async function Ne(r,i){const{error:a}=await f.from("newsletter_templates").update(i).eq("id",r);if(a)throw a}const Se=[{token:"{{customer_name}}",description:"Customer full name",example:"John Smith"},{token:"{{first_name}}",description:"Customer first name",example:"John"},{token:"{{vehicle_info}}",description:"Vehicle year, make, model",example:"2020 Toyota Camry"},{token:"{{vehicle_year}}",description:"Vehicle year",example:"2020"},{token:"{{vehicle_make}}",description:"Vehicle make",example:"Toyota"},{token:"{{vehicle_model}}",description:"Vehicle model",example:"Camry"},{token:"{{shop_name}}",description:"Your shop name",example:"Elite Auto Service"},{token:"{{booking_link}}",description:"Online booking URL",example:"https://..."}],Ce=[{month_number:1,subject:"🎊 New Year, New Maintenance Goals",preview_text:"Kick off the year with a winter safety check and savings",holiday_theme:"New Year's Day",seasonal_theme:"Winter",content:`Hi {{first_name}},

Happy New Year from {{shop_name}}!

Start 2026 with confidence by giving your {{vehicle_info}} a fresh maintenance reset.

🎉 **January Offer: Winter Safety Check**
- Battery health test
- Tire pressure and tread inspection
- Coolant and antifreeze check
- Wiper blade performance review
- Heater and defrost inspection

Book this month and save **15%** on recommended winter services.

📅 **Book now:** {{booking_link}}

Safe travels,
The Team at {{shop_name}}`,is_active:!0},{month_number:2,subject:"❤️ February Car Care Special",preview_text:"Show your vehicle some love with preventative maintenance",holiday_theme:"Valentine's Day",seasonal_theme:"Winter",content:`Hi {{first_name}},

This month, show your {{vehicle_make}} a little love.

❤️ **Valentine's Special: Love Your Car Package**
- Oil and filter service
- Brake visual inspection
- Battery terminal cleaning
- Fluid top-off
- Complimentary multi-point check

Preventative care now helps avoid surprise repairs later.

📅 **Reserve your spot:** {{booking_link}}

With appreciation,
{{shop_name}}`,is_active:!0},{month_number:3,subject:"🍀 Spring Tune-Up Savings Inside",preview_text:"Refresh your ride for spring weather and road trips",holiday_theme:"St. Patrick's Day",seasonal_theme:"Spring",content:`Hi {{first_name}},

Spring is around the corner, which means it's tune-up time.

🍀 **March Offer: Spring Readiness Service**
- Air filter check
- A/C performance test
- Alignment and tire wear review
- Suspension quick check
- Cabin filter inspection

Drive into spring with better comfort, efficiency, and safety.

📅 **Schedule service:** {{booking_link}}

See you soon,
The Team at {{shop_name}}`,is_active:!0},{month_number:4,subject:"🌧️ Rainy Season Safety Reminder",preview_text:"April maintenance tips for wet roads and better visibility",holiday_theme:"Earth Day",seasonal_theme:"Spring",content:`Hi {{first_name}},

April showers can make driving unpredictable.

🌍 **Earth Day + Safety Focus**
- Wiper blade replacement options
- Tire traction check
- Headlight and taillight inspection
- Windshield chip review
- Eco-friendly oil options available

Come in this month for a wet-weather safety inspection and drive with confidence.

📅 **Book your appointment:** {{booking_link}}

Thanks for supporting local,
{{shop_name}}`,is_active:!0},{month_number:5,subject:"🎖️ Memorial Day Road Trip Prep",preview_text:"Travel-ready inspections before summer plans begin",holiday_theme:"Memorial Day",seasonal_theme:"Spring/Summer",content:`Hi {{first_name}},

Memorial Day travel season is almost here.

🚗 **May Offer: Pre-Trip Confidence Check**
- 40-point road trip inspection
- Tire and spare tire check
- Brake performance check
- Cooling system review
- Battery load test

Avoid mid-trip stress and start summer on the right foot.

📅 **Plan ahead and book:** {{booking_link}}

Wishing you safe travels,
The Team at {{shop_name}}`,is_active:!0},{month_number:6,subject:"☀️ Stay Cool This Summer",preview_text:"June A/C and cooling-system specials are now available",holiday_theme:"Father's Day",seasonal_theme:"Summer",content:`Hi {{first_name}},

Hot weather is here — is your A/C ready?

☀️ **June Offer: Beat-the-Heat Service**
- A/C performance test
- Cabin airflow check
- Cooling system pressure review
- Belt and hose visual inspection
- Refrigerant service recommendations

Make every drive cooler and more comfortable this summer.

📅 **Book A/C service:** {{booking_link}}

Regards,
{{shop_name}}`,is_active:!0},{month_number:7,subject:"🎆 Mid-Summer Reliability Check",preview_text:"Keep your vehicle dependable through peak travel season",holiday_theme:"Independence Day",seasonal_theme:"Summer",content:`Hi {{first_name}},

July is one of the busiest driving months of the year.

🎆 **Independence Month Special**
- Battery and charging-system test
- Tire pressure calibration
- Brake condition check
- Fluid condition scan
- Quick under-hood safety review

A quick mid-summer check can prevent major breakdowns.

📅 **Claim your July slot:** {{booking_link}}

Drive safe,
The Team at {{shop_name}}`,is_active:!0},{month_number:8,subject:"📚 Back-to-School Vehicle Safety",preview_text:"Make daily commutes safer before the school rush",holiday_theme:"Back to School",seasonal_theme:"Late Summer",content:`Hi {{first_name}},

Back-to-school traffic is here, and safety matters more than ever.

🎒 **August Offer: Family Safety Service**
- Brake and rotor inspection
- Tire tread depth check
- Lights and signal test
- Wiper performance test
- Child seat anchor quick review

Protect your family with a proactive safety appointment.

📅 **Schedule now:** {{booking_link}}

Thank you,
{{shop_name}}`,is_active:!0},{month_number:9,subject:"🍂 Fall Maintenance Starts Now",preview_text:"Prepare for cooler mornings and changing road conditions",holiday_theme:"Labor Day",seasonal_theme:"Fall",content:`Hi {{first_name}},

As temperatures start dropping, September is perfect for preventive maintenance.

🍂 **Labor Day Month Offer**
- Battery health check
- Tire pressure adjustment for cooler weather
- Heater and defroster test
- Wiper and washer fluid review
- Brake response inspection

Stay ahead of seasonal wear before cold weather arrives.

📅 **Book fall service:** {{booking_link}}

Best,
The Team at {{shop_name}}`,is_active:!0},{month_number:10,subject:"🎃 Don’t Get Spooked by Unexpected Repairs",preview_text:"October pre-winter checks to reduce surprise breakdowns",holiday_theme:"Halloween",seasonal_theme:"Fall",content:`Hi {{first_name}},

A little prevention this month can save you from scary repair bills later.

🎃 **October Offer: Pre-Winter Inspection**
- Starter and battery test
- Tire condition and alignment check
- Brake wear inspection
- Exterior lighting review
- Coolant freeze-point check

Let’s make sure your {{vehicle_model}} is ready for colder nights.

📅 **Book your check-up:** {{booking_link}}

See you soon,
{{shop_name}}`,is_active:!0},{month_number:11,subject:"🦃 Thanksgiving Travel Prep",preview_text:"Free pre-trip checks available before holiday travel",holiday_theme:"Thanksgiving",seasonal_theme:"Fall/Winter",content:`Hi {{first_name}},

Holiday travel is almost here.

🦃 **November Offer: Pre-Trip Peace of Mind**
- Tire and pressure check
- Battery health check
- Fluid top-off
- Light and signal inspection
- Brake quick-test

Travel with confidence and reduce the risk of roadside surprises.

📅 **Reserve your pre-trip slot:** {{booking_link}}

Happy Thanksgiving,
The Team at {{shop_name}}`,is_active:!0},{month_number:12,subject:"🎄 Year-End Winter Readiness + Gift Cards",preview_text:"Finish the year strong with winter services and holiday gifting",holiday_theme:"Christmas / Hanukkah / New Year",seasonal_theme:"Winter",content:`Hi {{first_name}},

Thank you for trusting {{shop_name}} this year.

🎁 **December Highlights**
- Winter readiness inspection
- Battery and charging-system check
- Antifreeze and heater performance review
- Tire pressure reset for cold weather
- Gift cards available for friends and family

Let’s get your {{vehicle_info}} ready for holiday travel and the new year.

📅 **Book before year-end:** {{booking_link}}

Warm wishes,
The Team at {{shop_name}}`,is_active:!0}];function Te(){const{user:r}=ce(),[i,a]=o.useState([]),[j,w]=o.useState([]),[l,v]=o.useState(null),[n,_]=o.useState(null),[s,h]=o.useState(null),[Z,Q]=o.useState(!0),[g,X]=o.useState(!1),[L,ee]=o.useState(0),[te,C]=o.useState(!1),[T,O]=o.useState(""),[W,R]=o.useState(""),q=t=>t.replace(/\{\{customer_name\}\}/g,"John Smith").replace(/\{\{first_name\}\}/g,"John").replace(/\{\{vehicle_info\}\}/g,"2020 Toyota Camry").replace(/\{\{vehicle_year\}\}/g,"2020").replace(/\{\{vehicle_make\}\}/g,"Toyota").replace(/\{\{vehicle_model\}\}/g,"Camry").replace(/\{\{shop_name\}\}/g,"Elite Auto Service").replace(/\{\{booking_link\}\}/g,"https://your-shop.servicewriter.xyz/book");o.useEffect(()=>{r&&(z(),se())},[r]),o.useEffect(()=>{l&&A(l)},[l]);const z=async()=>{try{const t=await je(r?.id||"");a(t||[]),t&&t.length>0&&!l&&v(t[0].id)}catch(t){console.error("Error loading sequences:",t),p.error("Failed to load newsletter sequences")}finally{Q(!1)}},A=async t=>{try{const u=await we(t);w(u||[])}catch(u){console.error("Error loading templates:",u)}},se=async()=>{try{const t=await _e(r?.id||"");ee(t)}catch(t){console.error("Error loading subscriber count:",t)}},re=async()=>{if(!T.trim()){p.error("Please enter a sequence name");return}try{const t=await be(r?.id||"",T,W,Ce);p.success("✅ Newsletter sequence created with 12 monthly templates!"),C(!1),O(""),R(""),await z(),v(t)}catch(t){console.error("Error creating sequence:",t),p.error("Failed to create newsletter sequence")}},ae=async t=>{if(t.id)try{await ke(t.id,!t.is_active),p.success(`${b(t.month_number)} template ${t.is_active?"deactivated":"activated"}`),A(l)}catch(u){console.error("Error toggling template:",u),p.error("Failed to update template")}},ie=async()=>{if(!(!s||!s.id))try{await Ne(s.id,{subject:s.subject,preview_text:s.preview_text,content:s.content,holiday_theme:s.holiday_theme,seasonal_theme:s.seasonal_theme}),p.success("Template saved successfully!"),h(null),A(l)}catch(t){console.error("Error saving template:",t),p.error("Failed to save template")}},b=t=>["January","February","March","April","May","June","July","August","September","October","November","December"][t-1],ne=t=>{const oe=[S,ye,K,$,ge,$,pe,U,K,S,ue,xe][t-1];return e.jsx(oe,{className:"h-4 w-4"})};return Z?e.jsx("div",{className:"p-6",children:"Loading newsletter sequences..."}):e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-3xl font-bold",children:"Newsletter Sequence Manager"}),e.jsx("p",{className:"text-muted-foreground mt-1",children:"12-month automated newsletter campaign with holiday & seasonal content"})]}),e.jsxs(E,{open:te,onOpenChange:C,children:[e.jsx(le,{asChild:!0,children:e.jsxs(x,{children:[e.jsx(Y,{className:"h-4 w-4 mr-2"}),"Create Sequence"]})}),e.jsxs(H,{children:[e.jsx(D,{children:e.jsx(M,{children:"Create Newsletter Sequence"})}),e.jsxs("div",{className:"space-y-4 mt-4",children:[e.jsxs("div",{children:[e.jsx(c,{children:"Sequence Name"}),e.jsx(y,{placeholder:"e.g., 2026 Monthly Newsletter",value:T,onChange:t=>O(t.target.value)})]}),e.jsxs("div",{children:[e.jsx(c,{children:"Description"}),e.jsx(I,{placeholder:"Optional description...",value:W,onChange:t=>R(t.target.value)})]}),e.jsx(x,{onClick:re,className:"w-full",children:"Create with 12 Templates"})]})]})]})]}),e.jsx(m,{className:"border-primary/20 bg-primary/5",children:e.jsx(d,{className:"pt-6",children:e.jsxs("div",{className:"flex items-start gap-4",children:[e.jsx("div",{className:"flex-shrink-0",children:e.jsx("div",{className:"h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center",children:e.jsx(N,{className:"h-6 w-6 text-primary"})})}),e.jsxs("div",{className:"flex-1",children:[e.jsx("h3",{className:"font-semibold text-lg mb-1",children:"📬 Auto-Enrollment Active"}),e.jsx("p",{className:"text-sm text-muted-foreground mb-2",children:"Customers are automatically enrolled when they book appointments. They'll receive the next scheduled newsletter in your active sequence."}),e.jsxs("div",{className:"flex items-center gap-4 text-sm",children:[e.jsxs(k,{variant:"outline",className:"bg-background",children:[e.jsx(G,{className:"h-3 w-3 mr-1"}),L," Active Subscribers"]}),e.jsxs(k,{variant:"outline",className:"bg-background",children:[e.jsx(N,{className:"h-3 w-3 mr-1"}),"Auto-adds on booking"]})]})]})]})})}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-4",children:[e.jsx(m,{children:e.jsx(d,{className:"pt-6",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Active Sequences"}),e.jsx("p",{className:"text-2xl font-bold",children:i.filter(t=>t.is_active).length})]}),e.jsx(U,{className:"h-8 w-8 text-primary"})]})})}),e.jsx(m,{children:e.jsx(d,{className:"pt-6",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Active Subscribers"}),e.jsx("p",{className:"text-2xl font-bold",children:L})]}),e.jsx(G,{className:"h-8 w-8 text-primary"})]})})}),e.jsx(m,{children:e.jsx(d,{className:"pt-6",children:e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Templates Ready"}),e.jsxs("p",{className:"text-2xl font-bold",children:[j.filter(t=>t.is_active).length,"/12"]})]}),e.jsx(N,{className:"h-8 w-8 text-primary"})]})})})]}),i.length===0?e.jsx(m,{children:e.jsxs(d,{className:"p-12 text-center",children:[e.jsx(N,{className:"h-12 w-12 text-muted-foreground mx-auto mb-4"}),e.jsx("h3",{className:"text-xl font-semibold mb-2",children:"No Newsletter Sequences Yet"}),e.jsx("p",{className:"text-muted-foreground mb-4",children:"Create your first 12-month newsletter sequence with pre-configured holiday templates"}),e.jsxs(x,{onClick:()=>C(!0),children:[e.jsx(Y,{className:"h-4 w-4 mr-2"}),"Create Your First Sequence"]})]})}):e.jsxs(e.Fragment,{children:[e.jsxs(m,{children:[e.jsx(P,{children:e.jsx(B,{children:"Active Sequence"})}),e.jsx(d,{children:e.jsx("select",{className:"w-full p-2 border rounded",value:l||"",onChange:t=>v(t.target.value),children:i.map(t=>e.jsxs("option",{value:t.id,children:[t.name," ",t.is_active?"✓":"(Inactive)"]},t.id))})})]}),e.jsxs(m,{children:[e.jsxs(P,{children:[e.jsx(B,{children:"12 Monthly Email Templates"}),e.jsx(J,{children:"Pre-configured with holidays, seasonal themes, and proven content"})]}),e.jsx(d,{children:e.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",children:j.map(t=>e.jsxs(m,{className:`${t.is_active?"":"opacity-60"}`,children:[e.jsxs(P,{className:"pb-3",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[ne(t.month_number),e.jsx(B,{className:"text-base",children:b(t.month_number)})]}),e.jsx(V,{checked:t.is_active,onCheckedChange:()=>ae(t)})]}),e.jsx(J,{children:t.holiday_theme})]}),e.jsxs(d,{className:"space-y-3",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm font-medium truncate",children:t.subject}),e.jsx("p",{className:"text-xs text-muted-foreground truncate mt-1",children:t.preview_text})]}),e.jsx("div",{className:"flex gap-2",children:e.jsx(k,{variant:"outline",children:t.seasonal_theme})}),e.jsxs("div",{className:"flex gap-2",children:[e.jsxs(x,{variant:"outline",size:"sm",className:"flex-1",onClick:()=>_(t),children:[e.jsx(de,{className:"h-3 w-3 mr-1"}),"Preview"]}),e.jsxs(x,{variant:"outline",size:"sm",className:"flex-1",onClick:()=>h(t),children:[e.jsx(he,{className:"h-3 w-3 mr-1"}),"Edit"]})]})]})]},t.id))})})]})]}),e.jsx(E,{open:!!n,onOpenChange:()=>_(null),children:e.jsxs(H,{className:"max-w-3xl max-h-[80vh] overflow-y-auto",children:[e.jsx(D,{children:e.jsxs(M,{className:"flex items-center justify-between",children:[e.jsx("span",{children:n&&`${b(n.month_number)} Preview`}),e.jsxs("div",{className:"flex items-center gap-2 text-sm font-normal",children:[e.jsx(c,{htmlFor:"personalize-toggle",className:"cursor-pointer",children:"Show Personalized"}),e.jsx(V,{id:"personalize-toggle",checked:g,onCheckedChange:X})]})]})}),n&&e.jsxs("div",{className:"space-y-4",children:[g&&e.jsx(m,{className:"bg-primary/5 border-primary/20",children:e.jsx(d,{className:"pt-4",children:e.jsxs("p",{className:"text-xs text-muted-foreground flex items-center gap-2",children:[e.jsx(S,{className:"h-3 w-3 text-primary"}),"Preview showing sample personalization: Customer = John Smith, Vehicle = 2020 Toyota Camry"]})})}),e.jsxs("div",{children:[e.jsx(c,{children:"Subject Line"}),e.jsx("p",{className:"text-sm font-medium mt-1",children:g?q(n.subject):n.subject})]}),e.jsxs("div",{children:[e.jsx(c,{children:"Preview Text"}),e.jsx("p",{className:"text-sm text-muted-foreground mt-1",children:g?q(n.preview_text):n.preview_text})]}),e.jsxs("div",{children:[e.jsx(c,{children:"Holiday Theme"}),e.jsx(k,{className:"mt-1",children:n.holiday_theme})]}),e.jsxs("div",{children:[e.jsx(c,{children:"Email Content"}),e.jsx("div",{className:"mt-2 p-4 bg-muted rounded whitespace-pre-wrap text-sm",children:g?q(n.content):n.content})]})]})]})}),e.jsx(E,{open:!!s,onOpenChange:()=>h(null),children:e.jsxs(H,{className:"max-w-4xl max-h-[90vh] overflow-y-auto",children:[e.jsx(D,{children:e.jsx(M,{children:s&&`Edit ${b(s.month_number)} Template`})}),s&&e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{children:[e.jsx(c,{children:"Subject Line"}),e.jsx(y,{value:s.subject,onChange:t=>h({...s,subject:t.target.value}),maxLength:500})]}),e.jsxs("div",{children:[e.jsx(c,{children:"Preview Text"}),e.jsx(y,{value:s.preview_text,onChange:t=>h({...s,preview_text:t.target.value}),maxLength:255})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-4",children:[e.jsxs("div",{children:[e.jsx(c,{children:"Holiday Theme"}),e.jsx(y,{value:s.holiday_theme,onChange:t=>h({...s,holiday_theme:t.target.value})})]}),e.jsxs("div",{children:[e.jsx(c,{children:"Seasonal Theme"}),e.jsx(y,{value:s.seasonal_theme,onChange:t=>h({...s,seasonal_theme:t.target.value})})]})]}),e.jsx(m,{className:"bg-muted/50",children:e.jsxs(d,{className:"pt-4",children:[e.jsxs("div",{className:"flex items-start gap-2 mb-3",children:[e.jsx(S,{className:"h-4 w-4 text-primary mt-0.5"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm font-semibold",children:"Personalization Tokens"}),e.jsx("p",{className:"text-xs text-muted-foreground",children:"Copy and paste these into your email content"})]})]}),e.jsx("div",{className:"grid grid-cols-2 gap-2 text-xs",children:Se.map(t=>e.jsx("div",{className:"flex items-center justify-between p-2 bg-background rounded border hover:border-primary cursor-pointer",onClick:()=>{navigator.clipboard.writeText(t.token),p.success(`Copied ${t.token}`)},children:e.jsxs("div",{className:"flex-1",children:[e.jsx("code",{className:"font-mono text-primary",children:t.token}),e.jsx("p",{className:"text-muted-foreground mt-0.5",children:t.description})]})},t.token))}),e.jsxs("p",{className:"text-xs text-muted-foreground mt-2",children:["💡 Click any token to copy. Example: ",e.jsx("code",{className:"text-primary",children:"{{first_name}}"}),' becomes "John"']})]})}),e.jsxs("div",{children:[e.jsx(c,{children:"Email Content"}),e.jsx(I,{value:s.content,onChange:t=>h({...s,content:t.target.value}),rows:20,className:"font-mono text-sm"})]}),e.jsxs("div",{className:"flex justify-end gap-2",children:[e.jsx(x,{variant:"outline",onClick:()=>h(null),children:"Cancel"}),e.jsx(x,{onClick:ie,children:"Save Changes"})]})]})]})})]})}const Zt=()=>e.jsxs("div",{className:"min-h-screen bg-background",children:[e.jsx(fe,{}),e.jsx(me,{title:"Newsletter Sequences",children:e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-3xl font-bold mb-2",children:"Newsletter Sequences"}),e.jsx("p",{className:"text-muted-foreground",children:"Manage automated monthly newsletter campaigns with seasonal and holiday themes"})]}),e.jsx(Te,{})]})}),e.jsx(ve,{})]});export{Zt as default};
