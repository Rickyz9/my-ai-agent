import { Routes } from "@angular/router";

const loadGeneratePage = () => import("./pages/generate/generate.page").then((m) => m.GeneratePage);

export const routes: Routes = [
  {
    path: "",
    pathMatch: "full",
    loadComponent: loadGeneratePage
  },
  {
    path: "generate",
    loadComponent: loadGeneratePage
  },
  {
    path: "studio",
    loadComponent: () => import("./pages/studio/studio.page").then((m) => m.StudioPage)
  },
  {
    path: "jobs",
    loadComponent: () => import("./pages/jobs/jobs.page").then((m) => m.JobsPage)
  },
  {
    path: "jobs/:id",
    loadComponent: () => import("./pages/job-detail/job-detail.page").then((m) => m.JobDetailPage)
  },
  {
    path: "gallery",
    loadComponent: () => import("./pages/gallery/gallery.page").then((m) => m.GalleryPage)
  },
  {
    path: "models",
    loadComponent: () => import("./pages/models/models.page").then((m) => m.ModelsPage)
  },
  {
    path: "learning",
    loadComponent: () => import("./pages/learning/learning.page").then((m) => m.LearningPage)
  },
  {
    path: "quality-lab",
    loadComponent: () => import("./pages/quality-lab/quality-lab.page").then((m) => m.QualityLabPage)
  },
  {
    path: "**",
    redirectTo: ""
  }
];
