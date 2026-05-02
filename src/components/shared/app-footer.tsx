import { Mail } from "lucide-react";

export function AppFooter() {
  const supportEmail = "sksohail.swaraj@gmail.com";

  return (
    <footer className="mt-auto border-t bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-6 py-6">
        <div className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="font-display font-medium">
            ABTalks
            <span className="ml-2 font-normal text-muted-foreground/70">
              60-Day Coding Challenge
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <span>For any issue or enquiry:</span>
            <a
              href={`mailto:${supportEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {supportEmail}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
