import asyncio
from pywebvue import App
from simput.core import ObjectManager, UIManager
from simput.ui.web import VuetifyResolver
from simput.pywebvue.modules import SimPut
from pywebvue.modules import VTK

from vtkmodules.vtkFiltersSources import (
    vtkConeSource,
    vtkSphereSource,
    vtkCylinderSource,
)
from vtkHelper import View, Representation

# -----------------------------------------------------------------------------
# App initialization
# -----------------------------------------------------------------------------

app = App("VTK Demo", debug=True)
app.state = {
    # UI toggle for drawer
    "showMenu": True,
    "drawerMode": 0,
    # Data handling
    "activeId": None,
    "sourceIds": [],
    # Object creation
    "objName": "",
    "objType": "",
    "objTypes": [],
    # 3D view
    "view": None,
    # Import/Export
    "importFile": None,
    "exportContent": None,
}
app.enableModule(SimPut)
app.enableModule(VTK)

# -----------------------------------------------------------------------------
# SimPut initialization
# -----------------------------------------------------------------------------

obj_manager = ObjectManager()
ui_resolver = VuetifyResolver()
ui_manager = UIManager(obj_manager, ui_resolver)

obj_manager.load_model(yaml_content=app.txt("./model/model.yaml"))
ui_manager.load_language(yaml_content=app.txt("./model/model.yaml"))
ui_manager.load_ui(xml_content=app.txt("./model/ui.xml"))

# For VTK object creation
obj_manager.register_construtor("Cone", vtkConeSource)
obj_manager.register_construtor("Sphere", vtkSphereSource)
obj_manager.register_construtor("Cylinder", vtkCylinderSource)

# Setup network handlers + state properties
simput = SimPut.create_helper(ui_manager)

# Fill drop down with available objects
app.set("objTypes", obj_manager.types)

# -----------------------------------------------------------------------------
# VTK management
# -----------------------------------------------------------------------------

allow_reset_camera_on_ready = True
view = View()

# -----------------------------------------------------------------------------
# Data management
# -----------------------------------------------------------------------------


def update_sources(*args, **kwargs):
    ids = list(map(lambda p: p.get("id"), obj_manager.tags("Source")))
    app.set("sourceIds", ids)


# -----------------------------------------------------------------------------


def update_view(*args, **kwargs):
    app.set("view", VTK.scene(view.render_window))
    app.set("exportContent", None)


# -----------------------------------------------------------------------------


@app.trigger("create")
def create_object(name, type):
    obj = obj_manager.create(type, _name=name)
    app.set("activeId", obj.get("id"))


# -----------------------------------------------------------------------------


@app.trigger("delete")
def delete_object(obj_id):
    active_id = app.get("activeId")
    obj_manager.delete(obj_id)
    if active_id == obj_id:
        app.set("activeId", None)


# -----------------------------------------------------------------------------


@app.trigger("viewReady")
def on_ready():
    global allow_reset_camera_on_ready
    if allow_reset_camera_on_ready:
        allow_reset_camera_on_ready = False
        app.update(ref="view", method="resetCamera")


# -----------------------------------------------------------------------------


def on_change(topic, ids=None, **kwargs):
    if topic == "delete":
        update_sources()

    if topic == "create":
        for obj_id in ids:
            obj_vtk = obj_manager.get_object(obj_id)
            rep = Representation()
            rep.SetView(view)
            rep.SetInput(obj_vtk)
        update_sources()

    print("topic", topic)

    update_view()


obj_manager.on_change(on_change)

# -----------------------------------------------------------------------------
# Import / Export
# -----------------------------------------------------------------------------


@app.change("importFile")
def import_file():
    file_data = app.get("importFile")
    if file_data:
        json_content = file_data.get("content").decode("utf-8")
        obj_manager.load(file_content=json_content)

    # reset current import
    app.set("importFile", None)


# -----------------------------------------------------------------------------


@app.trigger("export")
def export_state():
    app.set("exportContent", obj_manager.save())


# -----------------------------------------------------------------------------
# Start server
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    update_sources()
    app.run_server()
