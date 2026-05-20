#!/usr/bin/env python3
import argparse
import asyncio
import base64
import os
import sys
import tempfile
import traceback
import uuid
from io import BytesIO

import torch
import trimesh
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image


def configure_repo_path(repo_dir: str) -> None:
    if repo_dir not in sys.path:
        sys.path.insert(0, repo_dir)


def load_image_from_base64(image: str) -> Image.Image:
    return Image.open(BytesIO(base64.b64decode(image)))


def build_worker(repo_dir: str, model_path: str, subfolder: str, tex_model_path: str, device: str, enable_tex: bool):
    configure_repo_path(repo_dir)

    from hy3dgen.rembg import BackgroundRemover
    from hy3dgen.shapegen import (
        DegenerateFaceRemover,
        FaceReducer,
        FloaterRemover,
        Hunyuan3DDiTFlowMatchingPipeline,
    )
    from hy3dgen.texgen import Hunyuan3DPaintPipeline

    class ModelWorker:
        def __init__(self):
            self.device = device
            self.rembg = BackgroundRemover()
            self.pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
                model_path,
                subfolder=subfolder,
                use_safetensors=True,
                device=device,
            )
            self.pipeline.enable_flashvdm(mc_algo="mc")
            self.pipeline_tex = (
                Hunyuan3DPaintPipeline.from_pretrained(tex_model_path)
                if enable_tex
                else None
            )

        @torch.inference_mode()
        def generate(self, uid: str, params: dict):
            if "image" in params:
                image = load_image_from_base64(params["image"])
            elif "text" in params:
                raise ValueError("Text-to-3D is not enabled in this local launcher.")
            else:
                raise ValueError("No input image provided")

            image = self.rembg(image)
            params["image"] = image

            if "mesh" in params:
                mesh = trimesh.load(BytesIO(base64.b64decode(params["mesh"])), file_type="glb")
            else:
                seed = params.get("seed", 1234)
                params["generator"] = torch.Generator(self.device).manual_seed(seed)
                params["octree_resolution"] = params.get("octree_resolution", 128)
                params["num_inference_steps"] = params.get("num_inference_steps", 5)
                params["guidance_scale"] = params.get("guidance_scale", 5.0)
                params["mc_algo"] = "mc"
                mesh = self.pipeline(**params)[0]

            if params.get("texture", False):
                mesh = FloaterRemover()(mesh)
                mesh = DegenerateFaceRemover()(mesh)
                mesh = FaceReducer()(mesh, max_facenum=params.get("face_count", 40000))
                if self.pipeline_tex is not None:
                    mesh = self.pipeline_tex(mesh, image)

            file_type = params.get("type", "glb")
            with tempfile.NamedTemporaryFile(suffix=f".{file_type}", delete=False) as temp_file:
                mesh.export(temp_file.name)
                mesh = trimesh.load(temp_file.name)
                save_path = os.path.join(tempfile.gettempdir(), f"{uid}.{file_type}")
                mesh.export(save_path)

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            return save_path

    return ModelWorker()


def create_app(worker):
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.post("/generate")
    async def generate(request: Request):
        params = await request.json()
        uid = str(uuid.uuid4())
        try:
            file_path = worker.generate(uid, params)
            return FileResponse(file_path)
        except Exception as error:
            print(f"Caught Unknown Error {error}")
            traceback.print_exc()
            return JSONResponse(
                {
                    "text": "**NETWORK ERROR DUE TO HIGH TRAFFIC. PLEASE REGENERATE OR REFRESH THIS PAGE.**",
                    "error_code": 1,
                },
                status_code=404,
            )

    @app.get("/openapi.json")
    async def openapi_passthrough():
        return app.openapi()

    return app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-dir", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8081)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--subfolder", required=True)
    parser.add_argument("--tex-model-path", default="tencent/Hunyuan3D-2")
    parser.add_argument("--device", default="mps")
    parser.add_argument("--limit-model-concurrency", type=int, default=5)
    parser.add_argument("--enable-tex", action="store_true")
    args = parser.parse_args()

    asyncio.Semaphore(args.limit_model_concurrency)
    worker = build_worker(
        repo_dir=args.repo_dir,
        model_path=args.model_path,
        subfolder=args.subfolder,
        tex_model_path=args.tex_model_path,
        device=args.device,
        enable_tex=args.enable_tex,
    )
    app = create_app(worker)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
