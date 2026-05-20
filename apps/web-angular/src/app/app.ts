import { Component } from "@angular/core";
import { RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSidenavModule } from "@angular/material/sidenav";
import { MatToolbarModule } from "@angular/material/toolbar";

@Component({
  selector: "app-root",
  imports: [MatButtonModule, MatIconModule, MatSidenavModule, MatToolbarModule, RouterModule],
  templateUrl: "./app.html",
  styleUrl: "./app.scss"
})
export class App {
  readonly navItems = [
    { label: "Generate", path: "/generate", icon: "auto_awesome" },
    { label: "Studio", path: "/studio", icon: "edit_note" },
    { label: "Jobs", path: "/jobs", icon: "schedule" },
    { label: "Gallery", path: "/gallery", icon: "photo_library" },
    { label: "Models", path: "/models", icon: "deployed_code" },
    { label: "Learning", path: "/learning", icon: "psychology" },
    { label: "Quality Lab", path: "/quality-lab", icon: "science" }
  ];
}
