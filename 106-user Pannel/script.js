const panel = document.querySelector(".panel");
const toggleBtn = document.getElementById("toggleBtn");

toggleBtn.addEventListener("click", ()=>{
    panel.classList.toggle("collapsed");
    const icon = toggleBtn.querySelector("i");

    if(panel.classList.contains("collapsed")){
        icon.classList.replace("fa-xmark", "fa-bars");
    } else{
          icon.classList.replace("fa-bars", "fa-xmark");
    }

})