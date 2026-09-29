import { describe, expect, it } from "vitest";
import { detectRoutes, normalizeRoutePath } from "../src/route-signatures.js";

function found(file: string, content: string): Array<{ method: string; path: string }> {
  return detectRoutes(file, content).map((r) => ({
    method: r.method,
    path: r.path,
  }));
}

describe("normalizeRoutePath (AC-DR.2)", () => {
  it("unifies :id, {id}, <id> and <int:id> forms", () => {
    expect(normalizeRoutePath("/pets/:id")).toBe("/pets/{id}");
    expect(normalizeRoutePath("/pets/{id}")).toBe("/pets/{id}");
    expect(normalizeRoutePath("/pets/<id>")).toBe("/pets/{id}");
    expect(normalizeRoutePath("/pets/<int:id>")).toBe("/pets/{id}");
  });

  it("adds leading slash, collapses doubles, strips trailing slash and anchors", () => {
    expect(normalizeRoutePath("pets")).toBe("/pets");
    expect(normalizeRoutePath("//pets//list/")).toBe("/pets/list");
    expect(normalizeRoutePath("/")).toBe("/");
    expect(normalizeRoutePath("^pets/$")).toBe("/pets");
  });

  it("get/GET compare equal after normalization in compare keys", () => {
    expect(normalizeRoutePath("/Pets")).toBe("/Pets");
  });
});

describe("route signatures (AC-DR.1)", () => {
  it("express: app/router verbs, Nest decorators, .route()", () => {
    expect(
      found(
        "app.js",
        "app.get('/pets', h);\nrouter.post(\"/pets\", h);\nfastify.delete('/pets/x', h);",
      ),
    ).toEqual([
      { method: "GET", path: "/pets" },
      { method: "POST", path: "/pets" },
      { method: "DELETE", path: "/pets/x" },
    ]);
    expect(found("c.ts", "@Get('pets')\nlist() {}")).toEqual([{ method: "GET", path: "/pets" }]);
    expect(found("r.ts", "router.route('/pets');")).toEqual([{ method: "*", path: "/pets" }]);
  });

  it("express: ignores non-route calls", () => {
    expect(found("a.js", "app.use('/x');\napp.listen(3000);\n// app.get('/old');")).toEqual([]);
  });

  it("spring: mappings, RequestMapping with methods, lone Path", () => {
    expect(
      found("C.java", '@GetMapping("/pets")\n@GetMapping(value="/cats")\n@PostMapping("/pets")'),
    ).toEqual([
      { method: "GET", path: "/cats" },
      { method: "GET", path: "/pets" },
      { method: "POST", path: "/pets" },
    ]);
    expect(
      found(
        "C.java",
        '@RequestMapping(value="/pets", method = {RequestMethod.GET, RequestMethod.POST})',
      ),
    ).toEqual([
      { method: "GET", path: "/pets" },
      { method: "POST", path: "/pets" },
    ]);
    expect(found("R.java", '@Path("/pets")')).toEqual([{ method: "*", path: "/pets" }]);
  });

  it("spring: ignores annotations without routes", () => {
    expect(found("C.java", '@Autowired\n@RequestParam("x")\n@PathParam("y")')).toEqual([]);
  });

  it("dotnet: Http verbs with paths, Route, Map* minimal APIs", () => {
    expect(
      found(
        "C.cs",
        '[HttpGet("/pets")]\n[HttpPost("/pets")]\n[Route("api/pets")]\napp.MapDelete("/pets/{id}", h);',
      ),
    ).toEqual([
      { method: "*", path: "/api/pets" },
      { method: "GET", path: "/pets" },
      { method: "POST", path: "/pets" },
      { method: "DELETE", path: "/pets/{id}" },
    ]);
  });

  it("dotnet: skips bare attributes and unrelated calls", () => {
    expect(found("C.cs", "[HttpGet]\n[Authorize]\n[FromQuery]\nclient.GetAsync(url);")).toEqual([]);
  });

  it("python: decorators, methods lists, django paths", () => {
    expect(
      found(
        "a.py",
        '@app.get("/pets")\n@router.post("/pets")\n@bp.route("/pets", methods=["GET", "POST"])',
      ),
    ).toEqual([
      { method: "GET", path: "/pets" },
      { method: "POST", path: "/pets" },
    ]);
    expect(found("u.py", 'path("pets/", views.x)')).toEqual([{ method: "*", path: "/pets" }]);
    expect(found("u.py", 're_path(r"^pets/(?P<id>\\d+)/$", v)')).toEqual([
      { method: "*", path: "/pets/{id}" },
    ]);
  });

  it("python: ignores non-route decorators and client calls", () => {
    expect(
      found("a.py", "@app.before_request\ndef x(): pass\nrequests.get(url)\n@pytest.fixture"),
    ).toEqual([]);
  });

  it("rails: sinatra verbs and resources expansion", () => {
    expect(found("a.rb", "get '/pets' do\npost \"/pets\" do")).toEqual([
      { method: "GET", path: "/pets" },
      { method: "POST", path: "/pets" },
    ]);
    const res = found("r.rb", "resources :pets");
    expect(res).toContainEqual({ method: "GET", path: "/pets" });
    expect(res).toContainEqual({ method: "DELETE", path: "/pets/{id}" });
    expect(res).toHaveLength(6);
  });

  it("rails: ignores getenv and comments", () => {
    expect(found("a.rb", "getenv('X')\n# get '/old' do")).toEqual([]);
  });

  it("go: HandleFunc, Methods chaining, gin/echo/chi verbs", () => {
    expect(found("m.go", 'http.HandleFunc("/pets", h)')).toEqual([{ method: "*", path: "/pets" }]);
    expect(found("m.go", 'mux.HandleFunc("/pets", h).Methods("GET", "POST")')).toEqual([
      { method: "GET", path: "/pets" },
      { method: "POST", path: "/pets" },
    ]);
    expect(found("m.go", 'router.GET("/pets", h)')).toEqual([{ method: "GET", path: "/pets" }]);
    expect(found("m.go", 'r.Get("/pets", h)')).toEqual([{ method: "GET", path: "/pets" }]);
  });

  it("go: ignores client calls and logging", () => {
    expect(found("m.go", 'http.Get(url)\nlog.Fatal(err)\nfmt.Sprintf("/pets/%d", 1)')).toEqual([]);
  });

  it("php: laravel, symfony attributes, slim", () => {
    expect(
      found("r.php", "Route::get('/pets', [C::class, 'i']);\n$app->post('/pets', $h);"),
    ).toEqual([
      { method: "GET", path: "/pets" },
      { method: "POST", path: "/pets" },
    ]);
    expect(found("c.php", "#[Route('/pets', methods: ['GET', 'POST'])]")).toEqual([
      { method: "GET", path: "/pets" },
      { method: "POST", path: "/pets" },
    ]);
    expect(found("c.php", "#[Route('/health')]")).toEqual([{ method: "*", path: "/health" }]);
  });

  it("php: ignores superglobals and redirects", () => {
    expect(found("r.php", "$_GET['x'];\nRoute::fallback($h);\nredirect('/pets');")).toEqual([]);
  });

  it("unknown extensions yield nothing (LLM sweep territory)", () => {
    expect(found("Main.xyz", 'app.get("/pets")')).toEqual([]);
  });
});
