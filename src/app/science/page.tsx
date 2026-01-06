import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Sun, Moon, Coffee, Pill, Activity } from "lucide-react";

export const metadata = {
  title: "The Science - Dawnward",
  description:
    "How circadian science powers Dawnward's jet lag optimization schedules.",
};

export default function SciencePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">
            The Science Behind Dawnward
          </h1>
          <p className="text-lg text-muted-foreground">
            Jet lag isn&apos;t just feeling tired—it&apos;s a measurable
            misalignment between your internal body clock and your new timezone.
            Here&apos;s how we help you fix it faster.
          </p>
        </div>

        {/* Your Body Clock */}
        <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
          <CardHeader>
            <CardTitle>Your Body Clock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Deep in your brain, about 20,000 neurons form a &quot;master
              clock&quot; that orchestrates your daily rhythms—when you feel
              sleepy, when you&apos;re most alert, when hormones release, and
              more.
            </p>
            <p>
              This clock runs on roughly a 24-hour cycle and synchronizes to
              your environment through external cues called{" "}
              <em>zeitgebers</em> (German for &quot;time givers&quot;). The most
              powerful zeitgeber is light.
            </p>
            <p>
              When you travel across timezones, your body clock is still set to
              home time. The symptoms you feel—fatigue, poor sleep, brain
              fog—are your internal rhythms clashing with your new environment.
            </p>
          </CardContent>
        </Card>

        {/* How Light Shifts Your Clock */}
        <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5 text-sunrise" />
              How Light Shifts Your Clock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Light exposure at different times has dramatically different
              effects on your body clock. This relationship is captured in what
              scientists call a <em>Phase Response Curve</em>.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Morning light</strong> shifts your clock earlier
                (advances)—helpful for eastward travel
              </li>
              <li>
                <strong>Evening light</strong> shifts your clock later
                (delays)—helpful for westward travel
              </li>
              <li>
                <strong>Light at the wrong time</strong> can shift you the wrong
                direction, making jet lag worse
              </li>
            </ul>
            <p>
              This is why we give you specific windows for seeking bright light
              and avoiding it. Timing matters more than intensity.
            </p>
          </CardContent>
        </Card>

        {/* Melatonin */}
        <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-sage" />
              Melatonin Timing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Your body naturally produces melatonin as darkness falls,
              signaling that sleep is coming. Taking low-dose melatonin (0.5mg)
              at the right time can help shift your clock—but it works opposite
              to light.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Evening melatonin</strong> advances your clock (eastward
                travel)
              </li>
              <li>
                <strong>Morning melatonin</strong> delays your clock (westward
                travel)
              </li>
            </ul>
            <p>
              A Cochrane review of 10 trials found melatonin significantly
              reduces jet lag symptoms for flights crossing 5+ timezones. The
              key is timing it correctly—which is what Dawnward calculates for
              you.
            </p>
          </CardContent>
        </Card>

        {/* Caffeine */}
        <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5 text-sunset" />
              Strategic Caffeine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Caffeine does more than keep you awake. Research published in{" "}
              <em>Science Translational Medicine</em> found that caffeine
              directly affects the circadian clock, causing roughly a 40-minute
              phase delay—about half the effect of bright light.
            </p>
            <p>
              We use caffeine strategically: helping you stay alert during
              required wake times in your new timezone, while cutting it off
              early enough that it doesn&apos;t interfere with your target
              sleep.
            </p>
          </CardContent>
        </Card>

        {/* Exercise */}
        <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-500" />
              Exercise Timing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Physical activity can help shift your circadian clock, following a
              pattern that roughly parallels the light response curve. Research
              by Youngstedt and colleagues (2019) mapped out these effects.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Morning exercise</strong> (around 7 AM) and{" "}
                <strong>afternoon exercise</strong> (1-4 PM) help advance your
                clock—useful for eastward travel
              </li>
              <li>
                <strong>Evening exercise</strong> (7-10 PM) helps delay your
                clock—useful for westward travel
              </li>
            </ul>
            <p>
              While not as powerful as light alone, exercise provides an
              additive benefit when combined with properly timed light exposure.
              It&apos;s particularly helpful for &quot;night owls&quot; who may
              struggle with morning light exposure.
            </p>
          </CardContent>
        </Card>

        {/* Napping */}
        <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Moon className="h-5 w-5 text-purple-500" />
              Strategic Napping
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Sleep scientists describe sleep timing using the &quot;Two-Process
              Model&quot; (Borbély, 1982): a homeostatic drive that builds while
              you&apos;re awake, and a circadian rhythm that creates natural
              peaks and dips in alertness.
            </p>
            <p>
              The &quot;post-lunch dip&quot; you feel around 1-3 PM isn&apos;t
              caused by eating—it&apos;s a biological rhythm that occurs even
              when people skip lunch. This makes mid-afternoon an ideal time for
              a strategic nap.
            </p>
            <p>For jet lag management, optimal nap timing depends on your shifted schedule:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Best window:</strong> 30-50% into your wake period
                (roughly mid-afternoon for conventional schedules)
              </li>
              <li>
                <strong>Duration:</strong> 20 minutes is ideal—long enough to
                restore alertness but short enough to avoid grogginess
              </li>
              <li>
                <strong>Avoid 30-60 minutes:</strong> This range risks waking
                from deep sleep, causing significant sleep inertia
              </li>
              <li>
                <strong>End 4+ hours before bedtime:</strong> Napping too late
                interferes with your main sleep
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* The Math */}
        <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Moon className="h-5 w-5 text-night" />
              The Math Behind Your Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Dawnward uses a mathematical model of the human circadian system
              to generate your schedule. The model simulates how your body clock
              responds to light, predicting the optimal intervention times for
              your specific trip.
            </p>
            <p>Key constraints the model respects:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Your clock can only shift about 1-1.5 hours per day when
                advancing (eastward)
              </li>
              <li>
                Delays (westward) are easier—up to 2 hours per day is possible
              </li>
              <li>
                For very large shifts (8+ timezones), sometimes delaying
                &quot;around the world&quot; is faster than advancing
              </li>
            </ul>
            <p>
              The model has been validated against human experimental data from
              controlled laboratory studies measuring circadian phase shifts.
            </p>
          </CardContent>
        </Card>

        {/* Limitations */}
        <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
          <CardHeader>
            <CardTitle>What We Don&apos;t Know</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>
              Science is honest about its limitations. Circadian research has
              some important caveats:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Individual variation is substantial—your response may differ
                from the average
              </li>
              <li>
                Most foundational studies used small sample sizes in controlled
                lab conditions
              </li>
              <li>
                Real-world compliance with schedules varies, and that affects
                outcomes
              </li>
              <li>
                The model captures your central brain clock, but other body
                tissues may adapt at different rates
              </li>
            </ul>
            <p>
              Dawnward gives you the best evidence-based guidance available, but
              your body is the final arbiter. Listen to it.
            </p>
          </CardContent>
        </Card>

        {/* References */}
        <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
          <CardHeader>
            <CardTitle>Key Research</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>Light Phase Response:</strong> Khalsa et al. (2003).{" "}
              <em>J Physiol</em>. The foundational human light PRC study.
            </p>
            <p>
              <strong>Melatonin PRC:</strong> Burgess et al. (2010).{" "}
              <em>J Clin Endocrinol Metab</em>. Comparing 0.5mg vs 3.0mg
              melatonin.
            </p>
            <p>
              <strong>Melatonin Efficacy:</strong> Herxheimer & Petrie (2002).{" "}
              <em>Cochrane Database Syst Rev</em>. Meta-analysis of jet lag
              trials.
            </p>
            <p>
              <strong>Caffeine Effects:</strong> Burke et al. (2015).{" "}
              <em>Sci Transl Med</em>. Discovery that caffeine shifts circadian
              phase.
            </p>
            <p>
              <strong>Exercise PRC:</strong> Youngstedt et al. (2019).{" "}
              <em>J Physiol</em>. Phase response curve for exercise timing.
            </p>
            <p>
              <strong>Two-Process Model:</strong> Borbély (1982).{" "}
              <em>Human Neurobiology</em>. Foundation of modern sleep regulation
              theory.
            </p>
            <p>
              <strong>Napping Benefits:</strong> Lovato & Lack (2010).{" "}
              <em>Prog Brain Res</em>. Effects of napping on cognitive
              functioning.
            </p>
            <p>
              <strong>Clinical Guidelines:</strong> Eastman & Burgess (2009).{" "}
              <em>Sleep Med Clin</em>. &quot;How to travel the world without jet
              lag.&quot;
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
